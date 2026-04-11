package schema

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ---------- Folder ----------

func (s *Store) ListFolders(ctx context.Context) ([]Folder, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, slug, label, icon, parent_id, sort_order, created_at, updated_at, created_by
		FROM _meta.folders
		ORDER BY sort_order, label`)
	if err != nil {
		return nil, fmt.Errorf("list folders: %w", err)
	}
	defer rows.Close()

	var out []Folder
	for rows.Next() {
		f, err := scanFolder(rows)
		if err != nil {
			return nil, fmt.Errorf("scan folder: %w", err)
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) GetFolder(ctx context.Context, id string) (Folder, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Folder{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	row := s.pool.QueryRow(ctx, `
		SELECT id, slug, label, icon, parent_id, sort_order, created_at, updated_at, created_by
		FROM _meta.folders WHERE id = $1`, uid)
	f, err := scanFolder(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Folder{}, fmt.Errorf("folder %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Folder{}, fmt.Errorf("get folder: %w", err)
	}
	return f, nil
}

func (s *Store) CreateFolder(ctx context.Context, req *CreateFolderReq) (Folder, error) {
	var (
		id pgtype.UUID
		f  Folder
	)
	var parentUID pgtype.UUID
	if req.ParentID != "" {
		parentUID, _ = parseUUID(req.ParentID)
	}
	var createdByUID pgtype.UUID
	if req.CreatedBy != "" {
		createdByUID, _ = parseUUID(req.CreatedBy)
	}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO _meta.folders (slug, label, icon, parent_id, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at`,
		req.Slug, req.Label, nilIfEmpty(req.Icon), parentUID, createdByUID,
	).Scan(&id, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return Folder{}, fmt.Errorf("insert folder: %w", err)
	}
	f.ID = uuidStr(id)
	f.Slug = req.Slug
	f.Label = req.Label
	f.Icon = req.Icon
	f.ParentID = req.ParentID
	f.CreatedBy = req.CreatedBy
	return f, nil
}

func (s *Store) UpdateFolder(ctx context.Context, id string, req *UpdateFolderReq) (Folder, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Folder{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	sets := []string{}
	args := []any{}
	argIdx := 1

	if req.Label != nil {
		sets = append(sets, fmt.Sprintf("label = $%d", argIdx))
		args = append(args, *req.Label)
		argIdx++
	}
	if req.Icon != nil {
		sets = append(sets, fmt.Sprintf("icon = $%d", argIdx))
		args = append(args, nilIfEmpty(*req.Icon))
		argIdx++
	}
	if req.SortOrder != nil {
		sets = append(sets, fmt.Sprintf("sort_order = $%d", argIdx))
		args = append(args, *req.SortOrder)
		argIdx++
	}

	if len(sets) == 0 {
		return s.GetFolder(ctx, id)
	}

	query := fmt.Sprintf(
		"UPDATE _meta.folders SET %s, updated_at = now() WHERE id = $%d RETURNING updated_at",
		joinStrings(sets, ", "), argIdx,
	)
	args = append(args, uid)

	var updatedAt pgtype.Timestamptz
	err = s.pool.QueryRow(ctx, query, args...).Scan(&updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Folder{}, fmt.Errorf("folder %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Folder{}, fmt.Errorf("update folder: %w", err)
	}
	return s.GetFolder(ctx, id)
}

func (s *Store) DeleteFolder(ctx context.Context, id string) error {
	uid, err := parseUUID(id)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	tag, err := s.pool.Exec(ctx, `DELETE FROM _meta.folders WHERE id = $1`, uid)
	if err != nil {
		return fmt.Errorf("delete folder: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("folder %s: %w", id, ErrNotFound)
	}
	return nil
}

func scanFolder(row pgx.Row) (Folder, error) {
	var (
		f         Folder
		id        pgtype.UUID
		parentID  pgtype.UUID
		createdBy pgtype.UUID
		icon      *string
	)
	err := row.Scan(&id, &f.Slug, &f.Label, &icon, &parentID, &f.SortOrder, &f.CreatedAt, &f.UpdatedAt, &createdBy)
	if err != nil {
		return Folder{}, err
	}
	f.ID = uuidStr(id)
	f.ParentID = uuidStr(parentID)
	f.CreatedBy = uuidStr(createdBy)
	if icon != nil {
		f.Icon = *icon
	}
	return f, nil
}

// ---------- Workbook ----------

const wbCols = `id, slug, label, description, icon, folder_id, sort_order, access_config, created_at, updated_at, created_by`

func (s *Store) ListWorkbooks(ctx context.Context) ([]Workbook, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+wbCols+` FROM _meta.workbooks ORDER BY sort_order, label`)
	if err != nil {
		return nil, fmt.Errorf("list workbooks: %w", err)
	}
	defer rows.Close()

	var out []Workbook
	for rows.Next() {
		wb, err := scanWorkbook(rows)
		if err != nil {
			return nil, fmt.Errorf("scan workbook: %w", err)
		}
		out = append(out, wb)
	}
	return out, rows.Err()
}

func (s *Store) GetWorkbook(ctx context.Context, id string) (Workbook, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Workbook{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	row := s.pool.QueryRow(ctx,
		`SELECT `+wbCols+` FROM _meta.workbooks WHERE id = $1`, uid)
	wb, err := scanWorkbook(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Workbook{}, fmt.Errorf("workbook %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Workbook{}, fmt.Errorf("get workbook: %w", err)
	}
	// Populate sheets.
	sheets, err := s.ListSheetsByWorkbook(ctx, wb.ID)
	if err != nil {
		return Workbook{}, err
	}
	wb.Sheets = sheets
	return wb, nil
}

func (s *Store) GetWorkbookBySlug(ctx context.Context, slug string) (Workbook, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+wbCols+` FROM _meta.workbooks WHERE slug = $1`, slug)
	wb, err := scanWorkbook(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Workbook{}, fmt.Errorf("workbook %q: %w", slug, ErrNotFound)
	}
	if err != nil {
		return Workbook{}, fmt.Errorf("get workbook by slug: %w", err)
	}
	return wb, nil
}

func (s *Store) CreateWorkbookTx(ctx context.Context, tx pgx.Tx, req *CreateWorkbookReq) (Workbook, error) {
	var (
		id pgtype.UUID
		wb Workbook
	)
	var acJSON []byte
	if req.AccessConfig != nil {
		var err error
		acJSON, err = json.Marshal(req.AccessConfig)
		if err != nil {
			return Workbook{}, fmt.Errorf("marshal access_config: %w", err)
		}
	}
	var folderUID pgtype.UUID
	if req.FolderID != "" {
		folderUID, _ = parseUUID(req.FolderID)
	}
	var createdByUID pgtype.UUID
	if req.CreatedBy != "" {
		createdByUID, _ = parseUUID(req.CreatedBy)
	}
	err := tx.QueryRow(ctx, `
		INSERT INTO _meta.workbooks (slug, label, description, icon, folder_id, access_config, created_by)
		VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{}'), $7)
		RETURNING id, created_at, updated_at`,
		req.Slug, req.Label, nilIfEmpty(req.Description), nilIfEmpty(req.Icon),
		folderUID, jsonOrNil(acJSON), createdByUID,
	).Scan(&id, &wb.CreatedAt, &wb.UpdatedAt)
	if err != nil {
		return Workbook{}, fmt.Errorf("insert workbook: %w", err)
	}
	wb.ID = uuidStr(id)
	wb.Slug = req.Slug
	wb.Label = req.Label
	wb.Description = req.Description
	wb.Icon = req.Icon
	wb.FolderID = req.FolderID
	wb.CreatedBy = req.CreatedBy
	if req.AccessConfig != nil {
		wb.AccessConfig = *req.AccessConfig
	}
	return wb, nil
}

// CreateWorkbook creates a workbook outside of an existing transaction.
func (s *Store) CreateWorkbook(ctx context.Context, req *CreateWorkbookReq) (Workbook, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Workbook{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	wb, err := s.CreateWorkbookTx(ctx, tx, req)
	if err != nil {
		return Workbook{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Workbook{}, fmt.Errorf("commit: %w", err)
	}
	return wb, nil
}

func (s *Store) UpdateWorkbook(ctx context.Context, id string, req *UpdateWorkbookReq) (Workbook, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return Workbook{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	sets := []string{}
	args := []any{}
	argIdx := 1

	if req.Label != nil {
		sets = append(sets, fmt.Sprintf("label = $%d", argIdx))
		args = append(args, *req.Label)
		argIdx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, nilIfEmpty(*req.Description))
		argIdx++
	}
	if req.Icon != nil {
		sets = append(sets, fmt.Sprintf("icon = $%d", argIdx))
		args = append(args, nilIfEmpty(*req.Icon))
		argIdx++
	}
	if req.FolderID != nil {
		sets = append(sets, fmt.Sprintf("folder_id = $%d", argIdx))
		if *req.FolderID == "" {
			args = append(args, pgtype.UUID{})
		} else {
			folderUID, _ := parseUUID(*req.FolderID)
			args = append(args, folderUID)
		}
		argIdx++
	}
	if req.SortOrder != nil {
		sets = append(sets, fmt.Sprintf("sort_order = $%d", argIdx))
		args = append(args, *req.SortOrder)
		argIdx++
	}
	if req.AccessConfig != nil {
		sets = append(sets, fmt.Sprintf("access_config = $%d", argIdx))
		acJSON, err := json.Marshal(req.AccessConfig)
		if err != nil {
			return Workbook{}, fmt.Errorf("marshal access_config: %w", err)
		}
		args = append(args, acJSON)
		argIdx++
	}

	if len(sets) == 0 {
		return s.GetWorkbook(ctx, id)
	}

	query := fmt.Sprintf(
		"UPDATE _meta.workbooks SET %s, updated_at = now() WHERE id = $%d RETURNING updated_at",
		joinStrings(sets, ", "), argIdx,
	)
	args = append(args, uid)

	var updatedAt pgtype.Timestamptz
	err = s.pool.QueryRow(ctx, query, args...).Scan(&updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Workbook{}, fmt.Errorf("workbook %s: %w", id, ErrNotFound)
	}
	if err != nil {
		return Workbook{}, fmt.Errorf("update workbook: %w", err)
	}
	return s.GetWorkbook(ctx, id)
}

func (s *Store) DeleteWorkbookTx(ctx context.Context, tx pgx.Tx, id string) error {
	uid, err := parseUUID(id)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	tag, err := tx.Exec(ctx, `DELETE FROM _meta.workbooks WHERE id = $1`, uid)
	if err != nil {
		return fmt.Errorf("delete workbook: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("workbook %s: %w", id, ErrNotFound)
	}
	return nil
}

// ListSheetsByWorkbook returns all collections belonging to a workbook, with fields populated.
func (s *Store) ListSheetsByWorkbook(ctx context.Context, workbookID string) ([]Collection, error) {
	uid, err := parseUUID(workbookID)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	rows, err := s.pool.Query(ctx,
		`SELECT `+colCols+` FROM _meta.collections WHERE workbook_id = $1 ORDER BY sort_order, label`, uid)
	if err != nil {
		return nil, fmt.Errorf("list sheets: %w", err)
	}
	defer rows.Close()

	var out []Collection
	for rows.Next() {
		c, err := scanCollection(rows)
		if err != nil {
			return nil, fmt.Errorf("scan sheet: %w", err)
		}
		// Populate fields for each sheet.
		fields, err := s.ListFields(ctx, c.ID)
		if err != nil {
			return nil, err
		}
		c.Fields = fields
		out = append(out, c)
	}
	return out, rows.Err()
}

// MoveSheet changes a collection's workbook_id.
func (s *Store) MoveSheet(ctx context.Context, collectionID, targetWorkbookID string) error {
	colUID, err := parseUUID(collectionID)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	wbUID, err := parseUUID(targetWorkbookID)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE _meta.collections SET workbook_id = $1, updated_at = now() WHERE id = $2`,
		wbUID, colUID)
	if err != nil {
		return fmt.Errorf("move sheet: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("collection %s: %w", collectionID, ErrNotFound)
	}
	return nil
}

func scanWorkbook(row pgx.Row) (Workbook, error) {
	var (
		wb        Workbook
		id        pgtype.UUID
		folderID  pgtype.UUID
		createdBy pgtype.UUID
		desc      *string
		icon      *string
		acRaw     []byte
	)
	err := row.Scan(
		&id, &wb.Slug, &wb.Label, &desc, &icon,
		&folderID, &wb.SortOrder, &acRaw, &wb.CreatedAt, &wb.UpdatedAt, &createdBy,
	)
	if err != nil {
		return Workbook{}, err
	}
	wb.ID = uuidStr(id)
	wb.FolderID = uuidStr(folderID)
	wb.CreatedBy = uuidStr(createdBy)
	if desc != nil {
		wb.Description = *desc
	}
	if icon != nil {
		wb.Icon = *icon
	}
	if len(acRaw) > 0 {
		if err := json.Unmarshal(acRaw, &wb.AccessConfig); err != nil {
			return Workbook{}, fmt.Errorf("unmarshal access_config: %w", err)
		}
	}
	return wb, nil
}
