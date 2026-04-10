package migration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/pgutil"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// Engine executes and records schema migrations.
type Engine struct {
	pool  *pgxpool.Pool
	store *schema.Store
	cache *schema.Cache
}

func NewEngine(pool *pgxpool.Pool, store *schema.Store, cache *schema.Cache) *Engine {
	return &Engine{pool: pool, store: store, cache: cache}
}

// ---------- Create Collection ----------

// CreateCollection creates the meta records and the data table in a single transaction.
func (e *Engine) CreateCollection(ctx context.Context, req *schema.CreateCollectionReq) (schema.Collection, error) {
	if err := schema.ValidateCollectionCreate(req); err != nil {
		return schema.Collection{}, err
	}

	// Pre-flight: slug uniqueness + relation targets exist.
	if _, exists := e.cache.CollectionBySlug(req.Slug); exists {
		return schema.Collection{}, fmt.Errorf("collection %q: %w", req.Slug, schema.ErrConflict)
	}
	for i := range req.Fields {
		if req.Fields[i].Relation == nil {
			continue
		}
		if _, ok := e.cache.CollectionByID(req.Fields[i].Relation.TargetCollectionID); !ok {
			return schema.Collection{}, fmt.Errorf("%w: field %q references unknown collection %s",
				schema.ErrInvalidInput, req.Fields[i].Slug, req.Fields[i].Relation.TargetCollectionID)
		}
	}

	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return schema.Collection{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Insert meta collection.
	col, err := e.store.CreateCollectionTx(ctx, tx, req)
	if err != nil {
		return schema.Collection{}, err
	}

	// 2. Insert meta fields.
	fields := make([]schema.Field, 0, len(req.Fields))
	for i := range req.Fields {
		f, err := e.store.CreateFieldTx(ctx, tx, col.ID, &req.Fields[i])
		if err != nil {
			return schema.Collection{}, fmt.Errorf("field %q: %w", req.Fields[i].Slug, err)
		}
		fields = append(fields, f)
	}
	col.Fields = fields

	// 3. Generate & execute CREATE TABLE.
	ddlUp, ddlDown := GenerateCreateTable(col, fields)
	if err := execStmts(ctx, tx, ddlUp); err != nil {
		return schema.Collection{}, fmt.Errorf("exec create table: %w", err)
	}

	// 4. Add FK / junction tables for relation fields.
	//    Statements are appended to ddlUp so the migration record is complete.
	for _, f := range fields {
		if f.Relation == nil {
			continue
		}
		stmts, err := e.applyRelationDDL(ctx, tx, col.Slug, f)
		if err != nil {
			return schema.Collection{}, err
		}
		ddlUp = append(ddlUp, stmts...)
	}

	// 5. Record migration.
	payload, err := json.Marshal(map[string]any{"collection": col})
	if err != nil {
		return schema.Collection{}, fmt.Errorf("marshal migration payload: %w", err)
	}
	if err := recordMigration(ctx, tx, col.ID, OpCreateCollection, payload, ddlUp, ddlDown, Safe); err != nil {
		return schema.Collection{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return schema.Collection{}, fmt.Errorf("commit: %w", err)
	}

	// Partial cache update: add just the new collection.
	if err := e.cache.ReloadCollection(ctx, col.ID); err != nil {
		slog.Warn("cache reload after CreateCollection", "error", err)
	}
	return col, nil
}

// applyRelationDDL creates the FK (for 1:1, 1:N) or junction table (for N:M).
// Returns the list of SQL statements it executed so the caller can append them
// to the migration record.
func (e *Engine) applyRelationDDL(ctx context.Context, tx pgx.Tx, ownerSlug string, f schema.Field) ([]string, error) {
	targetCol, ok := e.cache.CollectionByID(f.Relation.TargetCollectionID)
	if !ok {
		return nil, fmt.Errorf("%w: relation target %s does not exist",
			schema.ErrInvalidInput, f.Relation.TargetCollectionID)
	}
	tSlug := targetCol.Slug

	if f.Relation.RelationType == schema.RelManyToMany {
		junc := f.Relation.JunctionTable
		if junc == "" {
			junc = ownerSlug + "_" + tSlug + "_rel"
		}
		jUp, _ := GenerateJunctionTable(ownerSlug, tSlug, junc)
		if err := execStmts(ctx, tx, []string{jUp}); err != nil {
			return nil, fmt.Errorf("exec junction table %s: %w", junc, err)
		}
		slog.Info("junction table created", "owner", ownerSlug, "target", tSlug, "junction", junc)
		return []string{jUp}, nil
	}

	fkUp, _ := GenerateAddFK(ownerSlug, f.Slug, tSlug, f.Relation.OnDelete)
	if err := execStmts(ctx, tx, []string{fkUp}); err != nil {
		return nil, fmt.Errorf("exec FK %s.%s → %s: %w", ownerSlug, f.Slug, tSlug, err)
	}
	slog.Info("FK created", "owner", ownerSlug, "field", f.Slug, "target", tSlug)
	return []string{fkUp}, nil
}

// ---------- Update Collection (meta-only) ----------

// UpdateCollection changes label/description/icon/sort_order without DDL.
// Recorded in migration history with empty DDL so the audit trail is complete.
func (e *Engine) UpdateCollection(ctx context.Context, id string, req *schema.UpdateCollectionReq) (schema.Collection, error) {
	before, err := e.store.GetCollection(ctx, id)
	if err != nil {
		return schema.Collection{}, err
	}

	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return schema.Collection{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Apply the update via the store, but inside our own tx.
	if err := updateCollectionTx(ctx, tx, id, req); err != nil {
		return schema.Collection{}, err
	}

	payload, err := json.Marshal(map[string]any{
		"before":  before,
		"changes": req,
	})
	if err != nil {
		return schema.Collection{}, fmt.Errorf("marshal migration payload: %w", err)
	}
	// Empty DDL — this is a metadata-only change.
	if err := recordMigration(ctx, tx, id, OpUpdateCollectionMeta, payload, nil, nil, Safe); err != nil {
		return schema.Collection{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return schema.Collection{}, fmt.Errorf("commit: %w", err)
	}

	if err := e.cache.ReloadCollection(ctx, id); err != nil {
		slog.Warn("cache reload after UpdateCollection", "error", err)
	}
	return e.store.GetCollection(ctx, id)
}

// updateCollectionTx applies meta-only updates inside an existing transaction.
// (The store has its own UpdateCollection that runs against the pool — we need
// the tx variant for atomic recording with the migration row.)
func updateCollectionTx(ctx context.Context, tx pgx.Tx, id string, req *schema.UpdateCollectionReq) error {
	uid := pgUUID(id)
	sets := []string{}
	args := []any{}
	idx := 1

	if req.Label != nil {
		sets = append(sets, fmt.Sprintf("label = $%d", idx))
		args = append(args, *req.Label)
		idx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", idx))
		args = append(args, nilStr(*req.Description))
		idx++
	}
	if req.Icon != nil {
		sets = append(sets, fmt.Sprintf("icon = $%d", idx))
		args = append(args, nilStr(*req.Icon))
		idx++
	}
	if req.SortOrder != nil {
		sets = append(sets, fmt.Sprintf("sort_order = $%d", idx))
		args = append(args, *req.SortOrder)
		idx++
	}
	if len(sets) == 0 {
		return nil
	}
	args = append(args, uid)
	q := fmt.Sprintf("UPDATE _meta.collections SET %s, updated_at = now() WHERE id = $%d",
		strings.Join(sets, ", "), idx)
	tag, err := tx.Exec(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("update collection: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("collection %s: %w", id, schema.ErrNotFound)
	}
	return nil
}

// ---------- Drop Collection ----------

// PreviewDropCollection returns the impact analysis without modifying anything.
func (e *Engine) PreviewDropCollection(ctx context.Context, collectionID string) (Preview, error) {
	col, ok := e.cache.CollectionByID(collectionID)
	if !ok {
		return Preview{}, fmt.Errorf("collection %s: %w", collectionID, schema.ErrNotFound)
	}

	qTable := quoteIdent("data", col.Slug)
	var count int64
	err := e.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE deleted_at IS NULL", qTable)).Scan(&count)
	if err != nil {
		count = 0 // table might not exist
	}

	ddlUp, _ := GenerateDropTable(col.Slug)
	ddlDown, _ := GenerateCreateTable(col, col.Fields)
	return Preview{
		SafetyLevel:  Dangerous,
		Description:  fmt.Sprintf("컬렉션 %q (%s) 삭제", col.Label, col.Slug),
		AffectedRows: count,
		DDLUp:        ddlUp,
		DDLDown:      ddlDown,
		Warnings:     []string{fmt.Sprintf("테이블의 %d행 데이터가 영구 삭제됩니다.", count)},
	}, nil
}

// DropCollection executes the collection deletion.
func (e *Engine) DropCollection(ctx context.Context, collectionID string) error {
	col, ok := e.cache.CollectionByID(collectionID)
	if !ok {
		return fmt.Errorf("collection %s: %w", collectionID, schema.ErrNotFound)
	}
	if col.IsSystem {
		return fmt.Errorf("%w: system collection %q cannot be deleted", schema.ErrInvalidInput, col.Slug)
	}

	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	ddlUp, _ := GenerateDropTable(col.Slug)
	// Down: re-create the table so rollback can restore the structure.
	ddlDown, _ := GenerateCreateTable(col, col.Fields)
	payload, err := json.Marshal(map[string]any{"collection": col})
	if err != nil {
		return fmt.Errorf("marshal migration payload: %w", err)
	}

	if err := execStmts(ctx, tx, ddlUp); err != nil {
		return fmt.Errorf("exec drop table: %w", err)
	}
	if err := e.store.DeleteCollectionTx(ctx, tx, collectionID); err != nil {
		return err
	}
	if err := recordMigration(ctx, tx, collectionID, OpDropCollection, payload, ddlUp, ddlDown, Dangerous); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	e.cache.RemoveCollection(collectionID)
	return nil
}

// ---------- Add Field ----------

// AddField adds a field to an existing collection.
// Returns (field, preview, error). If preview is non-nil, confirmation is needed.
func (e *Engine) AddField(ctx context.Context, collectionID string, req *schema.CreateFieldIn, confirmed bool) (schema.Field, *Preview, error) {
	if err := schema.ValidateFieldCreate(req); err != nil {
		return schema.Field{}, nil, err
	}

	col, ok := e.cache.CollectionByID(collectionID)
	if !ok {
		return schema.Field{}, nil, fmt.Errorf("collection %s: %w", collectionID, schema.ErrNotFound)
	}

	safety := ClassifyAddField(req)
	if safety != Safe && !confirmed {
		qTable := quoteIdent("data", col.Slug)
		var count int64
		if err := e.pool.QueryRow(ctx,
			fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE deleted_at IS NULL", qTable)).Scan(&count); err != nil {
			return schema.Field{}, nil, fmt.Errorf("count rows for %s: %w", col.Slug, err)
		}

		tmpField := schema.Field{Slug: req.Slug, FieldType: req.FieldType, IsRequired: req.IsRequired, DefaultValue: req.DefaultValue}
		ddlUp, ddlDown := GenerateAddColumn(col.Slug, tmpField)
		return schema.Field{}, &Preview{
			SafetyLevel:  safety,
			Description:  fmt.Sprintf("NOT NULL 필드 %q을(를) %q에 추가 (기본값 없음)", req.Slug, col.Slug),
			AffectedRows: count,
			DDLUp:        ddlUp,
			DDLDown:      ddlDown,
			Warnings:     []string{fmt.Sprintf("기존 %d행에 값이 필요합니다. default_value를 설정하거나 confirm하세요.", count)},
		}, nil
	}

	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return schema.Field{}, nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	f, err := e.store.CreateFieldTx(ctx, tx, collectionID, req)
	if err != nil {
		return schema.Field{}, nil, err
	}

	var ddlUp, ddlDown []string

	// Layout and virtual (formula) fields produce no DDL.
	if !f.FieldType.IsLayout() && !f.FieldType.IsVirtual() {
		ddlUp, ddlDown = GenerateAddColumn(col.Slug, f)
		if err := execStmts(ctx, tx, ddlUp); err != nil {
			return schema.Field{}, nil, fmt.Errorf("exec add column: %w", err)
		}

		// FK / junction for relation.
		if f.Relation != nil {
			stmts, err := e.applyRelationDDL(ctx, tx, col.Slug, f)
			if err != nil {
				return schema.Field{}, nil, err
			}
			ddlUp = append(ddlUp, stmts...)
		}
	}

	payload, err := json.Marshal(map[string]any{"field": f, "collection_slug": col.Slug})
	if err != nil {
		return schema.Field{}, nil, fmt.Errorf("marshal migration payload: %w", err)
	}
	if err := recordMigration(ctx, tx, collectionID, OpAddField, payload, ddlUp, ddlDown, safety); err != nil {
		return schema.Field{}, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return schema.Field{}, nil, fmt.Errorf("commit: %w", err)
	}
	if err := e.cache.ReloadCollection(ctx, collectionID); err != nil {
		slog.Warn("cache reload after AddField", "error", err)
	}
	return f, nil, nil
}

// ---------- Alter Field ----------

// AlterField modifies field properties.
// Returns (preview, error). If preview is non-nil, confirmation is needed.
func (e *Engine) AlterField(ctx context.Context, fieldID string, req *schema.UpdateFieldReq, confirmed bool) (*Preview, error) {
	old, err := e.store.GetField(ctx, fieldID)
	if err != nil {
		return nil, err
	}
	col, ok := e.cache.CollectionByID(old.CollectionID)
	if !ok {
		return nil, fmt.Errorf("collection %s: %w", old.CollectionID, schema.ErrNotFound)
	}

	safety := ClassifyAlterField(old, req)

	// Build DDL statements.
	var ddlUp []string
	var ddlDown []string

	if req.FieldType != nil && *req.FieldType != old.FieldType {
		// Block layout ↔ non-layout conversion.
		if old.FieldType.IsLayout() != req.FieldType.IsLayout() {
			return nil, fmt.Errorf("%w: cannot convert between layout and data field types",
				schema.ErrInvalidInput)
		}
		// Block virtual ↔ non-virtual conversion.
		if old.FieldType.IsVirtual() != req.FieldType.IsVirtual() {
			return nil, fmt.Errorf("%w: cannot convert between formula and data field types",
				schema.ErrInvalidInput)
		}
		allowed, conditional := CheckCompat(old.FieldType, *req.FieldType)
		if !allowed {
			return nil, fmt.Errorf("%w: conversion from %s to %s is not supported",
				schema.ErrInvalidInput, old.FieldType, *req.FieldType)
		}

		if conditional && !confirmed {
			total, incompatible, sample, err := ValidateConversion(ctx, e.pool, col.Slug, old.Slug, old.FieldType, *req.FieldType)
			if err != nil {
				return nil, err
			}
			up, down := GenerateAlterColumnType(col.Slug, old.Slug, old.FieldType, *req.FieldType)
			warnings := []string{}
			if incompatible > 0 {
				warnings = append(warnings, fmt.Sprintf("%d행의 데이터가 변환과 호환되지 않습니다.", incompatible))
			}
			return &Preview{
				SafetyLevel:        Dangerous,
				Description:        fmt.Sprintf("%s.%s 타입을 %s → %s로 변경", col.Slug, old.Slug, old.FieldType, *req.FieldType),
				AffectedRows:       total,
				IncompatibleRows:   incompatible,
				IncompatibleSample: sample,
				DDLUp:              up,
				DDLDown:            down,
				Warnings:           warnings,
			}, nil
		}

		up, down := GenerateAlterColumnType(col.Slug, old.Slug, old.FieldType, *req.FieldType)
		ddlUp = append(ddlUp, up...)
		ddlDown = append(ddlDown, down...)
	}

	if req.IsRequired != nil && *req.IsRequired != old.IsRequired {
		if *req.IsRequired {
			ddlUp = append(ddlUp, GenerateSetNotNull(col.Slug, old.Slug))
			ddlDown = append(ddlDown, GenerateDropNotNull(col.Slug, old.Slug))
		} else {
			ddlUp = append(ddlUp, GenerateDropNotNull(col.Slug, old.Slug))
			ddlDown = append(ddlDown, GenerateSetNotNull(col.Slug, old.Slug))
		}
	}

	if safety != Safe && !confirmed {
		return &Preview{
			SafetyLevel: safety,
			Description: fmt.Sprintf("필드 %s.%s 속성 변경", col.Slug, old.Slug),
			DDLUp:       ddlUp,
			DDLDown:     ddlDown,
		}, nil
	}

	// Apply.
	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := e.store.UpdateFieldTx(ctx, tx, fieldID, req); err != nil {
		return nil, err
	}

	if len(ddlUp) > 0 {
		if err := execStmts(ctx, tx, ddlUp); err != nil {
			return nil, fmt.Errorf("exec alter field: %w", err)
		}
	}

	payload, err := json.Marshal(map[string]any{
		"field_id":        fieldID,
		"collection_slug": col.Slug,
		"before":          old,
		"changes":         req,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal migration payload: %w", err)
	}
	if err := recordMigration(ctx, tx, old.CollectionID, OpAlterField, payload, ddlUp, ddlDown, safety); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	if err := e.cache.ReloadCollection(ctx, old.CollectionID); err != nil {
		slog.Warn("cache reload after AlterField", "error", err)
	}
	return nil, nil
}

// ---------- Drop Field ----------

func (e *Engine) PreviewDropField(ctx context.Context, fieldID string) (Preview, error) {
	f, err := e.store.GetField(ctx, fieldID)
	if err != nil {
		return Preview{}, err
	}
	col, ok := e.cache.CollectionByID(f.CollectionID)
	if !ok {
		return Preview{}, fmt.Errorf("collection %s: %w", f.CollectionID, schema.ErrNotFound)
	}

	// Layout and virtual (formula) fields have no data — always safe to drop.
	if f.FieldType.IsLayout() || f.FieldType.IsVirtual() {
		return Preview{
			SafetyLevel: Safe,
			Description: fmt.Sprintf("레이아웃/수식 필드 %s.%s 삭제", col.Slug, f.Slug),
		}, nil
	}

	qTable := quoteIdent("data", col.Slug)
	qCol := quoteIdentSingle(f.Slug)
	var nonNull int64
	if err := e.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE deleted_at IS NULL AND %s IS NOT NULL", qTable, qCol),
	).Scan(&nonNull); err != nil {
		return Preview{}, fmt.Errorf("count non-null rows for %s.%s: %w", col.Slug, f.Slug, err)
	}

	ddlUp, ddlDown := GenerateDropColumn(col.Slug, f)
	return Preview{
		SafetyLevel:  Dangerous,
		Description:  fmt.Sprintf("필드 %s.%s 삭제", col.Slug, f.Slug),
		AffectedRows: nonNull,
		DDLUp:        ddlUp,
		DDLDown:      ddlDown,
		Warnings:     []string{fmt.Sprintf("값이 있는 %d행의 데이터가 영구 삭제됩니다.", nonNull)},
	}, nil
}

func (e *Engine) DropField(ctx context.Context, fieldID string) error {
	f, err := e.store.GetField(ctx, fieldID)
	if err != nil {
		return err
	}
	col, ok := e.cache.CollectionByID(f.CollectionID)
	if !ok {
		return fmt.Errorf("collection %s: %w", f.CollectionID, schema.ErrNotFound)
	}

	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var ddlUp, ddlDown []string

	// Layout and virtual fields have no DB column — just delete the meta row.
	if f.FieldType.IsLayout() || f.FieldType.IsVirtual() {
		// no DDL needed
	} else if f.Relation != nil && f.Relation.RelationType == schema.RelManyToMany {
		// Many-to-many fields are backed by a junction table, not a column on the owner table.
		junc := f.Relation.JunctionTable
		if junc == "" {
			target, ok := e.cache.CollectionByID(f.Relation.TargetCollectionID)
			if !ok {
				return fmt.Errorf("%w: junction target %s unknown", schema.ErrInvalidInput, f.Relation.TargetCollectionID)
			}
			junc = col.Slug + "_" + target.Slug + "_rel"
		}
		qJunc := quoteIdent("data", junc)
		ddlUp = []string{fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE", qJunc)}
		// Rollback: re-create the junction table.
		target, _ := e.cache.CollectionByID(f.Relation.TargetCollectionID)
		jUp, _ := GenerateJunctionTable(col.Slug, target.Slug, junc)
		ddlDown = []string{jUp}
	} else {
		ddlUp, ddlDown = GenerateDropColumn(col.Slug, f)
	}

	if err := execStmts(ctx, tx, ddlUp); err != nil {
		return fmt.Errorf("exec drop column: %w", err)
	}
	if err := e.store.DeleteFieldTx(ctx, tx, fieldID); err != nil {
		return err
	}

	payload, err := json.Marshal(map[string]any{"field": f, "collection_slug": col.Slug})
	if err != nil {
		return fmt.Errorf("marshal migration payload: %w", err)
	}
	if err := recordMigration(ctx, tx, f.CollectionID, OpDropField, payload, ddlUp, ddlDown, Dangerous); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	if err := e.cache.ReloadCollection(ctx, f.CollectionID); err != nil {
		slog.Warn("cache reload after DropField", "error", err)
	}
	return nil
}

// ---------- Rollback ----------

func (e *Engine) Rollback(ctx context.Context, migrationID string) error {
	mig, err := e.getMigration(ctx, migrationID)
	if err != nil {
		return err
	}
	if mig.AppliedAt == nil {
		return errors.New("migration not yet applied")
	}
	if mig.RolledBackAt != nil {
		return errors.New("migration already rolled back")
	}
	if len(mig.DDLDown) == 0 {
		return errors.New("no rollback DDL available for this migration")
	}

	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := execStmts(ctx, tx, mig.DDLDown); err != nil {
		return fmt.Errorf("exec rollback DDL: %w", err)
	}

	if err := e.restoreMeta(ctx, tx, mig); err != nil {
		return fmt.Errorf("restore meta: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE _history.schema_migrations SET rolled_back_at = now() WHERE id = $1`,
		pgUUID(mig.ID))
	if err != nil {
		return fmt.Errorf("update rollback timestamp: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit rollback: %w", err)
	}
	// Rollback may affect one or more collections and the specific impact depends
	// on the operation; easiest to do a full reload here since rollbacks are rare.
	if err := e.cache.Invalidate(ctx); err != nil {
		slog.Warn("cache reload after Rollback", "error", err)
	}
	return nil
}

func (e *Engine) restoreMeta(ctx context.Context, tx pgx.Tx, mig Migration) error {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(mig.Payload, &payload); err != nil {
		return err
	}

	switch mig.Operation {
	case OpCreateCollection:
		var col schema.Collection
		if raw, ok := payload["collection"]; ok {
			if err := json.Unmarshal(raw, &col); err != nil {
				return fmt.Errorf("unmarshal collection: %w", err)
			}
		}
		if col.ID != "" {
			if err := e.store.DeleteCollectionTx(ctx, tx, col.ID); err != nil {
				return fmt.Errorf("delete collection during rollback: %w", err)
			}
		}

	case OpAddField:
		var f schema.Field
		if raw, ok := payload["field"]; ok {
			if err := json.Unmarshal(raw, &f); err != nil {
				return fmt.Errorf("unmarshal field: %w", err)
			}
		}
		if f.ID != "" {
			if err := e.store.DeleteFieldTx(ctx, tx, f.ID); err != nil {
				return fmt.Errorf("delete field during rollback: %w", err)
			}
		}

	case OpAlterField:
		var before schema.Field
		if raw, ok := payload["before"]; ok {
			if err := json.Unmarshal(raw, &before); err != nil {
				return fmt.Errorf("unmarshal field before: %w", err)
			}
		}
		if before.ID != "" {
			req := &schema.UpdateFieldReq{
				Label:      &before.Label,
				FieldType:  &before.FieldType,
				IsRequired: &before.IsRequired,
				IsUnique:   &before.IsUnique,
				IsIndexed:  &before.IsIndexed,
			}
			if err := e.store.UpdateFieldTx(ctx, tx, before.ID, req); err != nil {
				return fmt.Errorf("update field during rollback: %w", err)
			}
		}

	case OpDropField:
		var f schema.Field
		if raw, ok := payload["field"]; ok {
			if err := json.Unmarshal(raw, &f); err != nil {
				return fmt.Errorf("unmarshal field: %w", err)
			}
		}
		if f.ID != "" {
			_, err := tx.Exec(ctx, `
				INSERT INTO _meta.fields (id, collection_id, slug, label, field_type, is_required, is_unique, is_indexed, default_value, options, width, height, sort_order)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
				ON CONFLICT DO NOTHING`,
				pgUUID(f.ID), pgUUID(f.CollectionID), f.Slug, f.Label, string(f.FieldType),
				f.IsRequired, f.IsUnique, f.IsIndexed,
				jsonBytesOrNil(f.DefaultValue), jsonBytesOrNil(f.Options),
				f.Width, f.Height, f.SortOrder,
			)
			if err != nil {
				return err
			}
		}

	case OpDropCollection:
		var col schema.Collection
		if raw, ok := payload["collection"]; ok {
			if err := json.Unmarshal(raw, &col); err != nil {
				return fmt.Errorf("unmarshal collection: %w", err)
			}
		}
		if col.ID != "" {
			_, err := tx.Exec(ctx, `
				INSERT INTO _meta.collections (id, slug, label, description, icon, is_system, sort_order, created_by)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				ON CONFLICT DO NOTHING`,
				pgUUID(col.ID), col.Slug, col.Label,
				nilStr(col.Description), nilStr(col.Icon),
				col.IsSystem, col.SortOrder, nilStr(col.CreatedBy),
			)
			if err != nil {
				return err
			}
			for _, f := range col.Fields {
				_, err := tx.Exec(ctx, `
					INSERT INTO _meta.fields (id, collection_id, slug, label, field_type, is_required, is_unique, is_indexed, default_value, options, width, height, sort_order)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
					ON CONFLICT DO NOTHING`,
					pgUUID(f.ID), pgUUID(f.CollectionID), f.Slug, f.Label, string(f.FieldType),
					f.IsRequired, f.IsUnique, f.IsIndexed,
					jsonBytesOrNil(f.DefaultValue), jsonBytesOrNil(f.Options),
					f.Width, f.Height, f.SortOrder,
				)
				if err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// ---------- History ----------

func (e *Engine) History(ctx context.Context, collectionID string) ([]Migration, error) {
	uid := pgUUID(collectionID)
	rows, err := e.pool.Query(ctx, `
		SELECT id, collection_id, operation, payload, ddl_up, ddl_down, safety_level,
		       created_at, applied_at, applied_by, rolled_back_at
		FROM _history.schema_migrations
		WHERE collection_id = $1
		ORDER BY created_at DESC`, uid)
	if err != nil {
		return nil, fmt.Errorf("query history: %w", err)
	}
	defer rows.Close()
	return scanMigrations(rows)
}

func (e *Engine) FullHistory(ctx context.Context) ([]Migration, error) {
	rows, err := e.pool.Query(ctx, `
		SELECT id, collection_id, operation, payload, ddl_up, ddl_down, safety_level,
		       created_at, applied_at, applied_by, rolled_back_at
		FROM _history.schema_migrations
		ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("query full history: %w", err)
	}
	defer rows.Close()
	return scanMigrations(rows)
}

// ---------- internal ----------

func (e *Engine) getMigration(ctx context.Context, id string) (Migration, error) {
	uid := pgUUID(id)
	row := e.pool.QueryRow(ctx, `
		SELECT id, collection_id, operation, payload, ddl_up, ddl_down, safety_level,
		       created_at, applied_at, applied_by, rolled_back_at
		FROM _history.schema_migrations
		WHERE id = $1`, uid)
	return scanMigrationRow(row)
}

func scanMigrations(rows pgx.Rows) ([]Migration, error) {
	var out []Migration
	for rows.Next() {
		m, err := scanMigrationRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func scanMigrationRow(row pgx.Row) (Migration, error) {
	var (
		m         Migration
		id        pgtype.UUID
		colID     pgtype.UUID
		op        string
		payload   []byte
		ddlUpRaw  string
		ddlDnRaw  string
		sl        string
		appliedAt *time.Time
		appliedBy pgtype.UUID
		rollAt    *time.Time
	)
	err := row.Scan(&id, &colID, &op, &payload, &ddlUpRaw, &ddlDnRaw, &sl,
		&m.CreatedAt, &appliedAt, &appliedBy, &rollAt)
	if err != nil {
		return Migration{}, err
	}
	m.ID = uuidToStr(id)
	m.CollectionID = uuidToStr(colID)
	m.Operation = Operation(op)
	m.Payload = json.RawMessage(payload)
	m.SafetyLevel = SafetyLevel(sl)
	m.AppliedAt = appliedAt
	m.AppliedBy = uuidToStr(appliedBy)
	m.RolledBackAt = rollAt

	// ddl_up / ddl_down are stored as JSON arrays of strings.
	if ddlUpRaw != "" {
		if err := json.Unmarshal([]byte(ddlUpRaw), &m.DDLUp); err != nil {
			// Backward-compat with any single-string records: fall back to single element.
			m.DDLUp = []string{ddlUpRaw}
		}
	}
	if ddlDnRaw != "" {
		if err := json.Unmarshal([]byte(ddlDnRaw), &m.DDLDown); err != nil {
			m.DDLDown = []string{ddlDnRaw}
		}
	}
	return m, nil
}

func recordMigration(ctx context.Context, tx pgx.Tx, collectionID string, op Operation, payload json.RawMessage, ddlUp, ddlDown []string, safety SafetyLevel) error {
	upJSON, err := json.Marshal(ddlUp)
	if err != nil {
		return fmt.Errorf("marshal ddl_up: %w", err)
	}
	downJSON, err := json.Marshal(ddlDown)
	if err != nil {
		return fmt.Errorf("marshal ddl_down: %w", err)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO _history.schema_migrations
			(collection_id, operation, payload, ddl_up, ddl_down, safety_level, applied_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())`,
		pgUUID(collectionID), string(op), []byte(payload),
		string(upJSON), string(downJSON), string(safety))
	if err != nil {
		return fmt.Errorf("record migration: %w", err)
	}
	return nil
}

// execStmts runs each statement in order inside the given transaction.
// Statements are treated as opaque — we never parse or split them, so embedded
// semicolons in function bodies or DO blocks are safe.
func execStmts(ctx context.Context, tx pgx.Tx, stmts []string) error {
	for _, stmt := range stmts {
		s := strings.TrimSpace(stmt)
		if s == "" {
			continue
		}
		if _, err := tx.Exec(ctx, s); err != nil {
			return fmt.Errorf("exec %q: %w", truncate(s, 80), err)
		}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// --- tiny local helpers (thin wrappers) ---

func uuidToStr(u pgtype.UUID) string { return pgutil.UUIDToString(u) }
func pgUUID(s string) pgtype.UUID    { return pgutil.ParseUUID(s) }

func nilStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func jsonBytesOrNil(raw json.RawMessage) []byte {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return []byte(raw)
}
