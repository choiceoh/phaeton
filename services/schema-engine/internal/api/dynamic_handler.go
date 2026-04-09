package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/pgutil"
	"github.com/choiceoh/phaeton/services/schema-engine/internal/schema"
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
	where, args, err := ParseFilters(params, fields)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	orderBy := ParseSort(params.Get("sort"), fields)
	page, limit, offset := ParsePagination(params)

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)

	// Count total.
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE deleted_at IS NULL %s", qTable, where)
	var total int64
	if err := h.pool.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Fetch page.
	selectCols := buildSelectCols(fields)
	dataSQL := fmt.Sprintf("SELECT %s FROM %s WHERE deleted_at IS NULL %s %s LIMIT %d OFFSET %d",
		selectCols, qTable, where, orderBy, limit, offset)

	rows, err := h.pool.Query(r.Context(), dataSQL, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	records, err := collectRows(rows)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

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
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	records, err := collectRows(rows)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(records) == 0 {
		writeError(w, http.StatusNotFound, "record not found")
		return
	}
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

	if err := validateInput(body, fields, true); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
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

	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING %s",
		qTable,
		strings.Join(colNames, ", "),
		strings.Join(placeholders, ", "),
		selectCols,
	)

	rows, err := h.pool.Query(r.Context(), sql, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	records, err := collectRows(rows)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
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

	if err := validateInput(body, fields, false); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
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
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	records, err := collectRows(rows)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(records) == 0 {
		writeError(w, http.StatusNotFound, "record not found")
		return
	}
	writeJSON(w, http.StatusOK, records[0])
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
		writeError(w, http.StatusInternalServerError, err.Error())
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

// validateInput checks required fields and basic type constraints.
func validateInput(body map[string]any, fields []schema.Field, isCreate bool) error {
	for _, f := range fields {
		v, exists := body[f.Slug]
		if f.IsRequired && isCreate && (!exists || v == nil) {
			return fmt.Errorf("field %q is required", f.Slug)
		}
	}
	return nil
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
