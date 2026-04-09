package migration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/pgutil"
	"github.com/choiceoh/phaeton/services/schema-engine/internal/schema"
)

// Engine executes and records schema migrations.
type Engine struct {
	pool  *pgxpool.Pool
	store *schema.Store
	cache *schema.Cache

	// OnSchemaChanged is fired after a committed schema mutation
	// (create/drop collection, add/drop/alter field, rollback).
	// The data engine registers an InvalidateSchema callback here
	// so its per-collection cache stays consistent with the
	// upstream schema.Cache. The hook is best-effort: nil is a
	// valid value and nothing is called.
	OnSchemaChanged func(collectionID string)
}

func NewEngine(pool *pgxpool.Pool, store *schema.Store, cache *schema.Cache) *Engine {
	return &Engine{pool: pool, store: store, cache: cache}
}

// notifyChanged centralises the hook call so every commit site has
// one line instead of a nil-check boilerplate.
func (e *Engine) notifyChanged(collectionID string) {
	if e.OnSchemaChanged != nil {
		e.OnSchemaChanged(collectionID)
	}
}

// ---------- Create Collection ----------

// CreateCollection creates the meta records and the data table in a single transaction.
func (e *Engine) CreateCollection(ctx context.Context, req *schema.CreateCollectionReq) (schema.Collection, error) {
	if err := schema.ValidateCollectionCreate(req); err != nil {
		return schema.Collection{}, err
	}

	// Verify slug uniqueness + relation targets exist before touching the DB.
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

	// 3. Generate & execute DDL.
	ddlUp, ddlDown := GenerateCreateTable(col, fields)
	if err := execMultiStmt(ctx, tx, ddlUp); err != nil {
		return schema.Collection{}, fmt.Errorf("exec create table: %w", err)
	}

	// 4. Add FK constraints (and junction tables) for relation fields.
	for _, f := range fields {
		if f.Relation == nil {
			continue
		}
		if err := e.applyRelationDDL(ctx, tx, col.Slug, f); err != nil {
			return schema.Collection{}, err
		}
	}

	// 5. Record migration.
	payload, _ := json.Marshal(map[string]any{"collection": col})
	if err := recordMigration(ctx, tx, col.ID, OpCreateCollection, payload, ddlUp, ddlDown, Safe); err != nil {
		return schema.Collection{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return schema.Collection{}, fmt.Errorf("commit: %w", err)
	}

	e.cache.Invalidate(ctx)
	e.notifyChanged(col.ID)
	return col, nil
}

// applyRelationDDL creates the FK (for 1:1, 1:N) or junction table (for N:M).
// Errors are fatal: the target must be a valid existing collection.
func (e *Engine) applyRelationDDL(ctx context.Context, tx pgx.Tx, ownerSlug string, f schema.Field) error {
	targetCol, ok := e.cache.CollectionByID(f.Relation.TargetCollectionID)
	if !ok {
		return fmt.Errorf("%w: relation target %s does not exist", schema.ErrInvalidInput, f.Relation.TargetCollectionID)
	}
	tSlug := targetCol.Slug

	if f.Relation.RelationType == schema.RelManyToMany {
		junc := f.Relation.JunctionTable
		if junc == "" {
			junc = ownerSlug + "_" + tSlug + "_rel"
		}
		jUp, _ := GenerateJunctionTable(ownerSlug, tSlug, junc)
		if err := execMultiStmt(ctx, tx, jUp); err != nil {
			return fmt.Errorf("exec junction table %s: %w", junc, err)
		}
		log.Printf("relation %s ↔ %s junction %q created", ownerSlug, tSlug, junc)
		return nil
	}

	fkUp, _ := GenerateAddFK(ownerSlug, f.Slug, tSlug, f.Relation.OnDelete)
	if err := execMultiStmt(ctx, tx, fkUp); err != nil {
		return fmt.Errorf("exec FK %s.%s → %s: %w", ownerSlug, f.Slug, tSlug, err)
	}
	log.Printf("relation %s.%s → %s.id created", ownerSlug, f.Slug, tSlug)
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

	ddlUp, ddlDown := GenerateDropTable(col.Slug)
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

	// Up: DROP TABLE. Down: re-create the exact same table so rollback works.
	ddlUp, _ := GenerateDropTable(col.Slug)
	ddlDown, _ := GenerateCreateTable(col, col.Fields)
	payload, _ := json.Marshal(map[string]any{"collection": col})

	if err := execMultiStmt(ctx, tx, ddlUp); err != nil {
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
	e.cache.Invalidate(ctx)
	e.notifyChanged(collectionID)
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
		e.pool.QueryRow(ctx,
			fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE deleted_at IS NULL", qTable)).Scan(&count)

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

	ddlUp, ddlDown := GenerateAddColumn(col.Slug, f)
	if err := execMultiStmt(ctx, tx, ddlUp); err != nil {
		return schema.Field{}, nil, fmt.Errorf("exec add column: %w", err)
	}

	// FK / junction table for relation.
	if f.Relation != nil {
		if err := e.applyRelationDDL(ctx, tx, col.Slug, f); err != nil {
			return schema.Field{}, nil, err
		}
	}

	payload, _ := json.Marshal(map[string]any{"field": f, "collection_slug": col.Slug})
	if err := recordMigration(ctx, tx, collectionID, OpAddField, payload, ddlUp, ddlDown, safety); err != nil {
		return schema.Field{}, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return schema.Field{}, nil, fmt.Errorf("commit: %w", err)
	}
	e.cache.Invalidate(ctx)
	e.notifyChanged(collectionID)
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
	var ddlParts []string
	var ddlDownParts []string

	if req.FieldType != nil && *req.FieldType != old.FieldType {
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
		ddlParts = append(ddlParts, up)
		ddlDownParts = append(ddlDownParts, down)
	}

	if req.IsRequired != nil && *req.IsRequired != old.IsRequired {
		if *req.IsRequired {
			ddlParts = append(ddlParts, GenerateSetNotNull(col.Slug, old.Slug))
			ddlDownParts = append(ddlDownParts, GenerateDropNotNull(col.Slug, old.Slug))
		} else {
			ddlParts = append(ddlParts, GenerateDropNotNull(col.Slug, old.Slug))
			ddlDownParts = append(ddlDownParts, GenerateSetNotNull(col.Slug, old.Slug))
		}
	}

	if safety != Safe && !confirmed {
		ddlUp := strings.Join(ddlParts, ";\n")
		ddlDown := strings.Join(ddlDownParts, ";\n")
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

	ddlUp := strings.Join(ddlParts, ";\n")
	ddlDown := strings.Join(ddlDownParts, ";\n")
	if ddlUp != "" {
		if err := execMultiStmt(ctx, tx, ddlUp); err != nil {
			return nil, fmt.Errorf("exec alter field: %w", err)
		}
	}

	payload, _ := json.Marshal(map[string]any{
		"field_id":        fieldID,
		"collection_slug": col.Slug,
		"before":          old,
		"changes":         req,
	})
	if err := recordMigration(ctx, tx, old.CollectionID, OpAlterField, payload, ddlUp, ddlDown, safety); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	e.cache.Invalidate(ctx)
	e.notifyChanged(old.CollectionID)
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

	qTable := quoteIdent("data", col.Slug)
	qCol := quoteIdentSingle(f.Slug)
	var nonNull int64
	e.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE deleted_at IS NULL AND %s IS NOT NULL", qTable, qCol),
	).Scan(&nonNull)

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

	ddlUp, ddlDown := GenerateDropColumn(col.Slug, f)
	if err := execMultiStmt(ctx, tx, ddlUp); err != nil {
		return fmt.Errorf("exec drop column: %w", err)
	}
	if err := e.store.DeleteFieldTx(ctx, tx, fieldID); err != nil {
		return err
	}

	payload, _ := json.Marshal(map[string]any{"field": f, "collection_slug": col.Slug})
	if err := recordMigration(ctx, tx, f.CollectionID, OpDropField, payload, ddlUp, ddlDown, Dangerous); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	e.cache.Invalidate(ctx)
	e.notifyChanged(f.CollectionID)
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
	if mig.DDLDown == "" {
		return errors.New("no rollback DDL available for this migration")
	}

	tx, err := e.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := execMultiStmt(ctx, tx, mig.DDLDown); err != nil {
		return fmt.Errorf("exec rollback DDL: %w", err)
	}

	// Restore meta state based on operation.
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
	e.cache.Invalidate(ctx)
	e.notifyChanged(mig.CollectionID)
	return nil
}

func (e *Engine) restoreMeta(ctx context.Context, tx pgx.Tx, mig Migration) error {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(mig.Payload, &payload); err != nil {
		return err
	}

	switch mig.Operation {
	case OpCreateCollection:
		// Rollback of create = delete the collection from _meta.
		var col schema.Collection
		if raw, ok := payload["collection"]; ok {
			json.Unmarshal(raw, &col)
		}
		if col.ID != "" {
			e.store.DeleteCollectionTx(ctx, tx, col.ID)
		}

	case OpAddField:
		// Rollback of add = delete the field from _meta.
		var f schema.Field
		if raw, ok := payload["field"]; ok {
			json.Unmarshal(raw, &f)
		}
		if f.ID != "" {
			e.store.DeleteFieldTx(ctx, tx, f.ID)
		}

	case OpAlterField:
		// Rollback of alter = restore the old field state in _meta.
		var before schema.Field
		if raw, ok := payload["before"]; ok {
			json.Unmarshal(raw, &before)
		}
		if before.ID != "" {
			req := &schema.UpdateFieldReq{
				Label:     &before.Label,
				FieldType: &before.FieldType,
				IsRequired: &before.IsRequired,
				IsUnique:  &before.IsUnique,
				IsIndexed: &before.IsIndexed,
			}
			e.store.UpdateFieldTx(ctx, tx, before.ID, req)
		}

	case OpDropField:
		// Rollback of drop = re-insert the field into _meta.
		// Column re-add is handled by ddl_down; meta needs to be restored.
		var f schema.Field
		if raw, ok := payload["field"]; ok {
			json.Unmarshal(raw, &f)
		}
		if f.ID != "" {
			// Re-insert field via raw SQL (since we need to preserve the original ID).
			_, err := tx.Exec(ctx, `
				INSERT INTO _meta.fields (id, collection_id, slug, label, field_type, is_required, is_unique, is_indexed, default_value, options, sort_order)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				ON CONFLICT DO NOTHING`,
				pgUUID(f.ID), pgUUID(f.CollectionID), f.Slug, f.Label, string(f.FieldType),
				f.IsRequired, f.IsUnique, f.IsIndexed,
				jsonBytesOrNil(f.DefaultValue), jsonBytesOrNil(f.Options), f.SortOrder,
			)
			if err != nil {
				return err
			}
		}

	case OpDropCollection:
		// Rollback of drop = ddl_down recreates the table; we need to re-insert the meta.
		// However, the original CREATE TABLE DDL from the create migration is in ddl_down of the drop migration
		// which is empty (by design). Full rollback of a dropped collection requires the original migration's DDL.
		// For now, only the table re-creation (if ddl_down is provided) is supported.
		// Meta restoration from payload:
		var col schema.Collection
		if raw, ok := payload["collection"]; ok {
			json.Unmarshal(raw, &col)
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
			// Re-insert fields.
			for _, f := range col.Fields {
				_, err := tx.Exec(ctx, `
					INSERT INTO _meta.fields (id, collection_id, slug, label, field_type, is_required, is_unique, is_indexed, default_value, options, sort_order)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
					ON CONFLICT DO NOTHING`,
					pgUUID(f.ID), pgUUID(f.CollectionID), f.Slug, f.Label, string(f.FieldType),
					f.IsRequired, f.IsUnique, f.IsIndexed,
					jsonBytesOrNil(f.DefaultValue), jsonBytesOrNil(f.Options), f.SortOrder,
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
		sl        string
		appliedAt *time.Time
		appliedBy pgtype.UUID
		rollAt    *time.Time
	)
	err := row.Scan(&id, &colID, &op, &payload, &m.DDLUp, &m.DDLDown, &sl,
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
	return m, nil
}

func recordMigration(ctx context.Context, tx pgx.Tx, collectionID string, op Operation, payload json.RawMessage, ddlUp, ddlDown string, safety SafetyLevel) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO _history.schema_migrations
			(collection_id, operation, payload, ddl_up, ddl_down, safety_level, applied_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())`,
		pgUUID(collectionID), string(op), []byte(payload), ddlUp, ddlDown, string(safety))
	if err != nil {
		return fmt.Errorf("record migration: %w", err)
	}
	return nil
}

// execMultiStmt splits on ";\n" and executes each statement.
func execMultiStmt(ctx context.Context, tx pgx.Tx, sql string) error {
	for _, stmt := range strings.Split(sql, ";\n") {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := tx.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("exec %q: %w", truncate(stmt, 80), err)
		}
	}
	return nil
}

func targetSlug(ctx context.Context, cache *schema.Cache, targetID string) string {
	col, ok := cache.CollectionByID(targetID)
	if !ok {
		return "unknown"
	}
	return col.Slug
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// --- tiny local helpers ---

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
