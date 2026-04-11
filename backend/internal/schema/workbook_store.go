package schema

import (
	"context"
	"errors"
	"fmt"
	"time"

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

// ---------- Workbook Lock ----------

// AcquireLock atomically acquires an edit lock on the workbook.
// Returns ErrConflict if another user already holds the lock.
func (s *Store) AcquireLock(ctx context.Context, workbookID, userID string) (Workbook, error) {
	wbUID, err := parseUUID(workbookID)
	if err != nil {
		return Workbook{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	uUID, err := parseUUID(userID)
	if err != nil {
		return Workbook{}, fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	row := s.pool.QueryRow(ctx, `
		UPDATE _meta.workbooks
		SET locked_by = $1, locked_at = now(), updated_at = now()
		WHERE id = $2 AND (locked_by IS NULL OR locked_by = $1)
		RETURNING id, label, icon, group_label, sort_order, created_at, updated_at, created_by, locked_by, locked_at`,
		uUID, wbUID)
	wb, err := scanWorkbook(row)
	if errors.Is(err, pgx.ErrNoRows) {
		// Lock held by someone else — return current lock owner.
		existing, err2 := s.getWorkbook(ctx, workbookID)
		if err2 != nil {
			return Workbook{}, fmt.Errorf("acquire lock: %w", err2)
		}
		return existing, ErrConflict
	}
	if err != nil {
		return Workbook{}, fmt.Errorf("acquire lock: %w", err)
	}
	return wb, nil
}

// ReleaseLock releases a lock held by the given user.
// Returns ErrConflict if the lock is held by a different user.
func (s *Store) ReleaseLock(ctx context.Context, workbookID, userID string) error {
	wbUID, err := parseUUID(workbookID)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	uUID, err := parseUUID(userID)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE _meta.workbooks
		SET locked_by = NULL, locked_at = NULL, updated_at = now()
		WHERE id = $1 AND locked_by = $2`,
		wbUID, uUID)
	if err != nil {
		return fmt.Errorf("release lock: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrConflict
	}
	return nil
}

// ForceReleaseLock releases any lock regardless of owner (director use).
func (s *Store) ForceReleaseLock(ctx context.Context, workbookID string) error {
	wbUID, err := parseUUID(workbookID)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	_, err = s.pool.Exec(ctx, `
		UPDATE _meta.workbooks
		SET locked_by = NULL, locked_at = NULL, updated_at = now()
		WHERE id = $1`, wbUID)
	if err != nil {
		return fmt.Errorf("force release lock: %w", err)
	}
	return nil
}

// ReleaseExpiredLocks clears locks older than the given timeout. Returns count released.
func (s *Store) ReleaseExpiredLocks(ctx context.Context, timeout time.Duration) (int, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE _meta.workbooks
		SET locked_by = NULL, locked_at = NULL, updated_at = now()
		WHERE locked_by IS NOT NULL AND locked_at < now() - $1::interval`,
		fmt.Sprintf("%d seconds", int(timeout.Seconds())))
	if err != nil {
		return 0, fmt.Errorf("release expired locks: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// ---------- Extra workbook helpers (not in main store.go) ----------

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
