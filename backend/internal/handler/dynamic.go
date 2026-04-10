package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/pgutil"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// DynHandler serves the Dynamic API (/api/data/...).
// It builds SQL queries at runtime based on the meta-table cache.
type DynHandler struct {
	pool  *pgxpool.Pool
	cache *schema.Cache
}

func NewDynHandler(pool *pgxpool.Pool, cache *schema.Cache) *DynHandler {
	return &DynHandler{pool: pool, cache: cache}
}

// --- List ---

func (h *DynHandler) List(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	params := r.URL.Query()
	page, limit, offset := ParsePagination(params)
	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)

	// Resolve relation targets for dot-notation sorts (e.g. "-subsidiary.name").
	resolveRel := func(f schema.Field) (string, bool) {
		if f.Relation == nil {
			return "", false
		}
		target, ok := h.cache.CollectionByID(f.Relation.TargetCollectionID)
		if !ok {
			return "", false
		}
		return fmt.Sprintf("%q.%q", "data", target.Slug), true
	}
	orderBy, sortJoins := ParseSortWithRelations(params.Get("sort"), fields, resolveRel)

	// Filters: when sort joins are present, columns must be qualified to avoid
	// ambiguous-column errors against the joined target tables.
	var (
		where string
		args  []any
		err   error
	)
	if len(sortJoins) > 0 {
		where, args, err = ParseFiltersWithPrefix(params, fields, qTable)
	} else {
		where, args, err = ParseFilters(params, fields)
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Text search: ?q=term searches across all text/textarea fields.
	searchClause, searchArgs := BuildSearchClause(
		params.Get("q"), fields,
		func() string { if len(sortJoins) > 0 { return qTable }; return "" }(),
		len(args)+1,
	)
	where += " " + searchClause
	args = append(args, searchArgs...)

	// Count total. Sort joins are not needed for COUNT, but we use the same
	// WHERE prefix to keep parameter ordering consistent.
	deletedClause := "deleted_at IS NULL"
	if len(sortJoins) > 0 {
		deletedClause = fmt.Sprintf("%s.deleted_at IS NULL", qTable)
	}
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s %s", qTable, deletedClause, where)
	var total int64
	if err := h.pool.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
		handleErr(w, r, err)
		return
	}

	// Build optional LEFT JOINs for relation sorting.
	joinClause := ""
	for _, j := range sortJoins {
		joinClause += fmt.Sprintf(" LEFT JOIN %s AS %s ON %s.%q = %s.id",
			j.TargetTable, j.Alias, qTable, j.OwnerColumn, j.Alias,
		)
	}

	// Fetch page. Qualify SELECT columns with the table name when joins are present.
	var selectCols string
	if joinClause != "" {
		selectCols = qualifySelectCols(fields, qTable)
	} else {
		selectCols = buildSelectCols(fields)
	}
	dataSQL := fmt.Sprintf("SELECT %s FROM %s%s WHERE %s %s %s LIMIT %d OFFSET %d",
		selectCols, qTable, joinClause, deletedClause, where, orderBy, limit, offset)

	rows, err := h.pool.Query(r.Context(), dataSQL, args...)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	records, err := collectRows(rows)
	rows.Close()
	if err != nil {
		handleErr(w, r, err)
		return
	}

	// Optional relation expansion.
	if expand := params.Get("expand"); expand != "" {
		if err := h.expandRelations(r.Context(), records, fields, expand); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	// Auto-expand user fields.
	h.expandUserFields(r.Context(), records, fields)

	writeList(w, records, total, page, limit)
}

// --- Get ---

func (h *DynHandler) Get(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	id := chi.URLParam(r, "id")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	selectCols := buildSelectCols(fields)
	sql := fmt.Sprintf("SELECT %s FROM %s WHERE id = $1 AND deleted_at IS NULL", selectCols, qTable)

	rows, err := h.pool.Query(r.Context(), sql, id)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	records, err := collectRows(rows)
	rows.Close()
	if err != nil {
		handleErr(w, r, err)
		return
	}
	if len(records) == 0 {
		writeError(w, http.StatusNotFound, "record not found")
		return
	}

	// Optional relation expansion.
	if expand := r.URL.Query().Get("expand"); expand != "" {
		if err := h.expandRelations(r.Context(), records, fields, expand); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	// Auto-expand user fields.
	h.expandUserFields(r.Context(), records, fields)

	writeJSON(w, http.StatusOK, records[0])
}

// --- Create ---

func (h *DynHandler) Create(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	var body map[string]any
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := validatePayload(r.Context(), h.pool, h.cache, body, fields, true); err != nil {
		handleErr(w, r, err)
		return
	}

	// Build INSERT.
	colNames := []string{}
	placeholders := []string{}
	args := []any{}
	idx := 1
	for _, f := range fields {
		v, exists := body[f.Slug]
		if !exists {
			continue
		}
		colNames = append(colNames, fmt.Sprintf("%q", f.Slug))
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		args = append(args, coerceValue(v, f.FieldType))
		idx++
	}

	// Optional: created_by from body (will be replaced by auth later).
	if cb, ok := body["created_by"]; ok {
		colNames = append(colNames, `"created_by"`)
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		args = append(args, cb)
		idx++
	}

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	selectCols := buildSelectCols(fields)

	var sql string
	if len(colNames) == 0 {
		// No recognized fields in body — insert a row with all auto-defaults.
		// PostgreSQL requires `DEFAULT VALUES` syntax for this; `() VALUES ()` is invalid.
		sql = fmt.Sprintf("INSERT INTO %s DEFAULT VALUES RETURNING %s", qTable, selectCols)
	} else {
		sql = fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING %s",
			qTable,
			strings.Join(colNames, ", "),
			strings.Join(placeholders, ", "),
			selectCols,
		)
	}

	rows, err := h.pool.Query(r.Context(), sql, args...)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	defer rows.Close()

	records, err := collectRows(rows)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	if len(records) == 0 {
		writeError(w, http.StatusInternalServerError, "insert returned no rows")
		return
	}
	writeJSON(w, http.StatusCreated, records[0])
}

// --- Update ---

func (h *DynHandler) Update(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	id := chi.URLParam(r, "id")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	var body map[string]any
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := validatePayload(r.Context(), h.pool, h.cache, body, fields, false); err != nil {
		handleErr(w, r, err)
		return
	}

	sets := []string{`"updated_at" = now()`}
	args := []any{}
	idx := 1
	for _, f := range fields {
		v, exists := body[f.Slug]
		if !exists {
			continue
		}
		sets = append(sets, fmt.Sprintf("%q = $%d", f.Slug, idx))
		args = append(args, coerceValue(v, f.FieldType))
		idx++
	}

	args = append(args, id)
	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	selectCols := buildSelectCols(fields)

	sql := fmt.Sprintf("UPDATE %s SET %s WHERE id = $%d AND deleted_at IS NULL RETURNING %s",
		qTable, strings.Join(sets, ", "), idx, selectCols)

	rows, err := h.pool.Query(r.Context(), sql, args...)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	defer rows.Close()

	records, err := collectRows(rows)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	if len(records) == 0 {
		writeError(w, http.StatusNotFound, "record not found")
		return
	}
	writeJSON(w, http.StatusOK, records[0])
}

// --- Aggregate ---

// Aggregate runs simple GROUP BY queries for dashboard widgets.
// Query params:
//   group=field_slug   — required, must be a non-relation column on this collection
//   fn=count|sum|avg|min|max — default: count
//   field=field_slug   — required for sum/avg/min/max; ignored for count
//   filter passthrough — same WHERE syntax as List
//
// Response: [{ "group": "<value>", "value": <number> }, ...]
func (h *DynHandler) Aggregate(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	params := r.URL.Query()
	groupSlug := params.Get("group")
	if groupSlug == "" {
		writeError(w, http.StatusBadRequest, "group parameter is required")
		return
	}

	// Validate group column.
	bySlug := make(map[string]schema.Field, len(fields))
	for _, f := range fields {
		bySlug[f.Slug] = f
	}
	groupField, ok := bySlug[groupSlug]
	if !ok {
		// Allow grouping by certain auto columns too.
		if groupSlug != "created_at" && groupSlug != "deleted_at" {
			handleErr(w, r, fmt.Errorf("%w: group field %q not found", schema.ErrInvalidInput, groupSlug))
			return
		}
	}
	if groupField.FieldType == schema.FieldRelation {
		// Grouping by raw UUID is allowed but unusual; client should expand.
	}

	fn := strings.ToLower(params.Get("fn"))
	if fn == "" {
		fn = "count"
	}

	var aggExpr string
	switch fn {
	case "count":
		aggExpr = "COUNT(*)"
	case "sum", "avg", "min", "max":
		fieldSlug := params.Get("field")
		if fieldSlug == "" {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("%s requires field parameter", fn))
			return
		}
		f, ok := bySlug[fieldSlug]
		if !ok {
			handleErr(w, r, fmt.Errorf("%w: field %q not found", schema.ErrInvalidInput, fieldSlug))
			return
		}
		if f.FieldType != schema.FieldNumber && f.FieldType != schema.FieldInteger {
			handleErr(w, r, fmt.Errorf("%w: %s requires numeric field, %s is %s",
				schema.ErrInvalidInput, fn, fieldSlug, f.FieldType))
			return
		}
		aggExpr = fmt.Sprintf("%s(%q)", strings.ToUpper(fn), fieldSlug)
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unknown aggregation function %q", fn))
		return
	}

	where, args, err := ParseFilters(params, fields)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	qGroup := fmt.Sprintf("%q", groupSlug)

	sql := fmt.Sprintf(
		"SELECT %s AS group_key, %s AS agg_value FROM %s WHERE deleted_at IS NULL %s GROUP BY %s ORDER BY %s",
		qGroup, aggExpr, qTable, where, qGroup, qGroup,
	)

	rows, err := h.pool.Query(r.Context(), sql, args...)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	defer rows.Close()

	type bucket struct {
		Group any `json:"group"`
		Value any `json:"value"`
	}
	var result []bucket
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			handleErr(w, r, err)
			return
		}
		result = append(result, bucket{
			Group: normalizeValue(vals[0]),
			Value: normalizeValue(vals[1]),
		})
	}
	if err := rows.Err(); err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// --- Bulk Create ---

// BulkCreate inserts an array of records in a single transaction.
// Returns 201 with the created rows, or 400/500 if any row fails (entire batch rolls back).
func (h *DynHandler) BulkCreate(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	var bodies []map[string]any
	if err := readJSON(r, &bodies); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(bodies) == 0 {
		writeError(w, http.StatusBadRequest, "empty bulk payload")
		return
	}
	if len(bodies) > 1000 {
		writeError(w, http.StatusBadRequest, "bulk payload too large (max 1000)")
		return
	}

	// Validate every record up front before opening a tx.
	for i, body := range bodies {
		if err := validatePayload(r.Context(), h.pool, h.cache, body, fields, true); err != nil {
			handleErr(w, r, fmt.Errorf("record[%d]: %w", i, err))
			return
		}
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		handleErr(w, r, err)
		return
	}
	defer tx.Rollback(r.Context())

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	selectCols := buildSelectCols(fields)

	created := make([]map[string]any, 0, len(bodies))
	for i, body := range bodies {
		colNames, placeholders, args := buildInsertColumns(body, fields)
		var sql string
		if len(colNames) == 0 {
			sql = fmt.Sprintf("INSERT INTO %s DEFAULT VALUES RETURNING %s", qTable, selectCols)
		} else {
			sql = fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING %s",
				qTable,
				strings.Join(colNames, ", "),
				strings.Join(placeholders, ", "),
				selectCols,
			)
		}
		rows, err := tx.Query(r.Context(), sql, args...)
		if err != nil {
			handleErr(w, r, fmt.Errorf("record[%d]: %w", i, err))
			return
		}
		recs, err := collectRows(rows)
		rows.Close()
		if err != nil {
			handleErr(w, r, fmt.Errorf("record[%d]: %w", i, err))
			return
		}
		if len(recs) > 0 {
			created = append(created, recs[0])
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// BulkDelete soft-deletes records by ID array.
// Body: { "ids": ["uuid1", "uuid2", ...] }
func (h *DynHandler) BulkDelete(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	col, _, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	var body struct {
		IDs []string `json:"ids"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "empty ids array")
		return
	}
	if len(body.IDs) > 1000 {
		writeError(w, http.StatusBadRequest, "too many ids (max 1000)")
		return
	}

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	args := make([]any, len(body.IDs))
	placeholders := make([]string, len(body.IDs))
	for i, id := range body.IDs {
		args[i] = id
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	sql := fmt.Sprintf(
		"UPDATE %s SET deleted_at = now() WHERE id IN (%s) AND deleted_at IS NULL",
		qTable, strings.Join(placeholders, ","),
	)
	tag, err := h.pool.Exec(r.Context(), sql, args...)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"deleted": tag.RowsAffected(),
	})
}

// buildInsertColumns extracts the column list for an INSERT from a body map,
// returning quoted column names, $-placeholders, and the matching arg values.
func buildInsertColumns(body map[string]any, fields []schema.Field) (cols []string, placeholders []string, args []any) {
	idx := 1
	for _, f := range fields {
		v, exists := body[f.Slug]
		if !exists {
			continue
		}
		cols = append(cols, fmt.Sprintf("%q", f.Slug))
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		args = append(args, coerceValue(v, f.FieldType))
		idx++
	}
	if cb, ok := body["created_by"]; ok {
		cols = append(cols, `"created_by"`)
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		args = append(args, cb)
	}
	return cols, placeholders, args
}

// --- Delete (soft) ---

func (h *DynHandler) Delete(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	id := chi.URLParam(r, "id")
	col, _, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	sql := fmt.Sprintf("UPDATE %s SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", qTable)

	tag, err := h.pool.Exec(r.Context(), sql, id)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "record not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// --- helpers ---

func (h *DynHandler) resolveCollection(w http.ResponseWriter, slug string) (schema.Collection, []schema.Field, bool) {
	col, ok := h.cache.CollectionBySlug(slug)
	if !ok {
		writeError(w, http.StatusNotFound, fmt.Sprintf("collection %q not found", slug))
		return schema.Collection{}, nil, false
	}
	fields := h.cache.Fields(col.ID)
	return col, fields, true
}

func buildSelectCols(fields []schema.Field) string {
	cols := []string{`"id"`}
	for _, f := range fields {
		cols = append(cols, fmt.Sprintf("%q", f.Slug))
	}
	cols = append(cols, `"created_at"`, `"updated_at"`, `"created_by"`, `"deleted_at"`)
	return strings.Join(cols, ", ")
}

// qualifySelectCols returns the same column list but each column qualified
// with the given table prefix and aliased back to its bare name so the
// row scanner sees the same field names.
func qualifySelectCols(fields []schema.Field, prefix string) string {
	cols := []string{fmt.Sprintf(`%s.%q AS %q`, prefix, "id", "id")}
	for _, f := range fields {
		cols = append(cols, fmt.Sprintf(`%s.%q AS %q`, prefix, f.Slug, f.Slug))
	}
	for _, sysCol := range []string{"created_at", "updated_at", "created_by", "deleted_at"} {
		cols = append(cols, fmt.Sprintf(`%s.%q AS %q`, prefix, sysCol, sysCol))
	}
	return strings.Join(cols, ", ")
}

// collectRows uses pgx.RowToMap and normalizes types.
func collectRows(rows pgx.Rows) ([]map[string]any, error) {
	var result []map[string]any
	descs := rows.FieldDescriptions()

	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		row := make(map[string]any, len(vals))
		for i, v := range vals {
			name := string(descs[i].Name)
			row[name] = normalizeValue(v)
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func normalizeValue(v any) any {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case [16]byte:
		return pgutil.FormatUUID(val)
	case pgtype.UUID:
		return pgutil.UUIDToString(val)
	case pgtype.Numeric:
		f, err := val.Float64Value()
		if err != nil || !f.Valid {
			return nil
		}
		return f.Float64
	case time.Time:
		if val.IsZero() {
			return nil
		}
		return val
	default:
		return val
	}
}

// expandRelations replaces UUID values in relation fields with the full target
// record. Each expand field triggers exactly one batched SELECT — no N+1 queries.
//
// Format: ?expand=field1,field2
// Only relation fields (non-M:N) are expandable; other field types and unknown
// slugs return an error so the client discovers the problem immediately.
func (h *DynHandler) expandRelations(ctx context.Context, records []map[string]any, fields []schema.Field, expandParam string) error {
	if len(records) == 0 {
		return nil
	}

	// Index the collection's fields for fast lookup.
	fieldBySlug := make(map[string]schema.Field, len(fields))
	for _, f := range fields {
		fieldBySlug[f.Slug] = f
	}

	for _, raw := range strings.Split(expandParam, ",") {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		f, ok := fieldBySlug[name]
		if !ok {
			return fmt.Errorf("expand: unknown field %q", name)
		}
		if f.FieldType != schema.FieldRelation {
			return fmt.Errorf("expand: field %q is not a relation", name)
		}
		if f.Relation == nil || f.Relation.RelationType == schema.RelManyToMany {
			// M:N would require a junction-table lookup; not supported yet.
			return fmt.Errorf("expand: %s is not expandable (many-to-many not supported)", name)
		}

		targetCol, ok := h.cache.CollectionByID(f.Relation.TargetCollectionID)
		if !ok {
			return fmt.Errorf("expand: target collection for %q not found", name)
		}

		// Collect distinct non-null UUIDs from the current result set.
		seen := make(map[string]struct{})
		ids := make([]string, 0, len(records))
		for _, row := range records {
			v := row[name]
			s, ok := v.(string)
			if !ok || s == "" {
				continue
			}
			if _, dup := seen[s]; dup {
				continue
			}
			seen[s] = struct{}{}
			ids = append(ids, s)
		}
		if len(ids) == 0 {
			continue
		}

		// Batch fetch targets in a single query.
		targetFields := h.cache.Fields(targetCol.ID)
		targetSelectCols := buildSelectCols(targetFields)

		placeholders := make([]string, len(ids))
		args := make([]any, len(ids))
		for i, id := range ids {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			args[i] = id
		}

		qTargetTable := fmt.Sprintf("%q.%q", "data", targetCol.Slug)
		sql := fmt.Sprintf(
			"SELECT %s FROM %s WHERE id IN (%s) AND deleted_at IS NULL",
			targetSelectCols, qTargetTable, strings.Join(placeholders, ","),
		)
		targetRows, err := h.pool.Query(ctx, sql, args...)
		if err != nil {
			return fmt.Errorf("expand %s: %w", name, err)
		}
		targetRecords, err := collectRows(targetRows)
		targetRows.Close()
		if err != nil {
			return fmt.Errorf("expand %s scan: %w", name, err)
		}

		// Build id → target row map.
		byID := make(map[string]map[string]any, len(targetRecords))
		for _, tr := range targetRecords {
			if id, ok := tr["id"].(string); ok {
				byID[id] = tr
			}
		}

		// Replace UUIDs with the nested record.
		for _, row := range records {
			s, ok := row[name].(string)
			if !ok || s == "" {
				continue
			}
			if target, found := byID[s]; found {
				row[name] = target
			}
		}
	}
	return nil
}

// expandUserFields batch-fetches auth.users for all user-type fields and replaces
// UUID values with {id, name, email} objects. This runs automatically, unlike
// relation expand which is opt-in.
func (h *DynHandler) expandUserFields(ctx context.Context, records []map[string]any, fields []schema.Field) {
	var userFields []schema.Field
	for _, f := range fields {
		if f.FieldType == schema.FieldUser {
			userFields = append(userFields, f)
		}
	}
	if len(userFields) == 0 {
		return
	}

	// Collect all distinct user UUIDs across all user fields.
	seen := make(map[string]struct{})
	var ids []string
	for _, row := range records {
		for _, f := range userFields {
			s, ok := row[f.Slug].(string)
			if !ok || s == "" {
				continue
			}
			if _, dup := seen[s]; dup {
				continue
			}
			seen[s] = struct{}{}
			ids = append(ids, s)
		}
	}
	if len(ids) == 0 {
		return
	}

	// Batch fetch users.
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	sql := fmt.Sprintf(
		`SELECT id, name, email FROM auth.users WHERE id IN (%s)`,
		strings.Join(placeholders, ","),
	)
	rows, err := h.pool.Query(ctx, sql, args...)
	if err != nil {
		return // best effort — don't fail the request
	}
	defer rows.Close()

	type userInfo struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	byID := make(map[string]userInfo)
	for rows.Next() {
		var u userInfo
		var uid pgtype.UUID
		if err := rows.Scan(&uid, &u.Name, &u.Email); err != nil {
			continue
		}
		u.ID = pgutil.UUIDToString(uid)
		byID[u.ID] = u
	}

	// Replace UUIDs with user objects.
	for _, row := range records {
		for _, f := range userFields {
			s, ok := row[f.Slug].(string)
			if !ok || s == "" {
				continue
			}
			if u, found := byID[s]; found {
				row[f.Slug] = u
			}
		}
	}
}

// coerceValue ensures the Go value matches what pgx expects for the column type.
func coerceValue(v any, ft schema.FieldType) any {
	if v == nil {
		return nil
	}
	switch ft {
	case schema.FieldMultiselect:
		// JSON array → []string
		switch arr := v.(type) {
		case []any:
			strs := make([]string, len(arr))
			for i, el := range arr {
				strs[i] = fmt.Sprint(el)
			}
			return strs
		}
	case schema.FieldJSON:
		// Keep as JSONB.
		b, _ := json.Marshal(v)
		return b
	case schema.FieldInteger:
		if f, ok := v.(float64); ok {
			return int64(f)
		}
	}
	return v
}
