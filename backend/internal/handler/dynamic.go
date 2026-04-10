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

	"github.com/choiceoh/phaeton/backend/internal/middleware"
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
	if !h.checkAccess(w, r, col, "entry_view") {
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

	// Row-level security: viewers only see their own rows.
	rlsClause := ""
	colRole := middleware.GetCollectionRole(r.Context())
	if colRole == "viewer" {
		user, _ := middleware.GetUser(r.Context())
		args = append(args, user.UserID)
		if len(sortJoins) > 0 {
			rlsClause = fmt.Sprintf(" AND %s.created_by = $%d", qTable, len(args))
		} else {
			rlsClause = fmt.Sprintf(" AND created_by = $%d", len(args))
		}
	}

	// Count total. Sort joins are not needed for COUNT, but we use the same
	// WHERE prefix to keep parameter ordering consistent.
	deletedClause := "deleted_at IS NULL"
	if len(sortJoins) > 0 {
		deletedClause = fmt.Sprintf("%s.deleted_at IS NULL", qTable)
	}
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s %s%s", qTable, deletedClause, where, rlsClause)
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
	procEnabled := h.hasProcessEnabled(col.ID)
	var selectCols string
	if joinClause != "" {
		selectCols = qualifySelectCols(fields, qTable, procEnabled)
	} else {
		selectCols = buildSelectCols(fields, procEnabled)
	}
	dataSQL := fmt.Sprintf("SELECT %s FROM %s%s WHERE %s %s%s %s LIMIT %d OFFSET %d",
		selectCols, qTable, joinClause, deletedClause, where, rlsClause, orderBy, limit, offset)

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

	// Resolve computed fields (formula, lookup, rollup).
	h.resolveComputedFields(r.Context(), records, fields)

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
	if !h.checkAccess(w, r, col, "entry_view") {
		return
	}

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	procEnabled := h.hasProcessEnabled(col.ID)
	selectCols := buildSelectCols(fields, procEnabled)

	// RLS: viewer can only see own rows.
	getArgs := []any{id}
	rlsGet := ""
	if colRole := middleware.GetCollectionRole(r.Context()); colRole == "viewer" {
		user, _ := middleware.GetUser(r.Context())
		getArgs = append(getArgs, user.UserID)
		rlsGet = fmt.Sprintf(" AND created_by = $%d", len(getArgs))
	}

	getSQL := fmt.Sprintf("SELECT %s FROM %s WHERE id = $1 AND deleted_at IS NULL%s", selectCols, qTable, rlsGet)

	rows, err := h.pool.Query(r.Context(), getSQL, getArgs...)
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

	// Resolve computed fields (formula, lookup, rollup).
	h.resolveComputedFields(r.Context(), records, fields)

	writeJSON(w, http.StatusOK, records[0])
}

// --- Create ---

func (h *DynHandler) Create(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}
	if !h.checkAccess(w, r, col, "entry_create") {
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
		if f.FieldType.NoColumn() {
			continue
		}
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
	}

	// Process: inject initial status for new entries.
	procEnabled := h.hasProcessEnabled(col.ID)
	if procEnabled {
		if initStatus := h.initialStatusName(col.ID); initStatus != "" {
			colNames = append(colNames, `"_status"`)
			placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
			args = append(args, initStatus)
			idx++
		}
	}

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	selectCols := buildSelectCols(fields, procEnabled)

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

	// Record change history.
	user, _ := middleware.GetUser(r.Context())
	if recID, ok := records[0]["id"].(string); ok {
		diff := createDiff(records[0], fields)
		recordChange(r.Context(), h.pool, col.ID, recID, user.UserID, user.Name, "create", diff)
	}

	// Resolve computed fields for the created record.
	h.resolveComputedFields(r.Context(), records, fields)

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
	if !h.checkAccess(w, r, col, "entry_edit") {
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

	// Fetch current row for transition check and change history.
	oldRow, err := h.fetchRow(r.Context(), col, fields, id)
	if err != nil {
		handleErr(w, r, err)
		return
	}

	user, _ := middleware.GetUser(r.Context())

	// Process transition check: if collection has process_enabled, enforce transition rules.
	if col.ProcessEnabled {
		if err := checkTransitions(oldRow, body, fields, user.Role); err != nil {
			handleErr(w, r, err)
			return
		}
	}

	sets := []string{`"updated_at" = now()`}
	args := []any{}
	idx := 1
	for _, f := range fields {
		if f.FieldType.NoColumn() || f.FieldType == schema.FieldAutonumber {
			continue
		}
		v, exists := body[f.Slug]
		if !exists {
			continue
		}
		sets = append(sets, fmt.Sprintf("%q = $%d", f.Slug, idx))
		args = append(args, coerceValue(v, f.FieldType))
		idx++
	}

	// Process: validate and apply status transition.
	procEnabled := h.hasProcessEnabled(col.ID)
	if newStatus, ok := body["_status"]; ok && newStatus != nil {
		if !procEnabled {
			writeError(w, http.StatusBadRequest, "이 컬렉션에는 프로세스가 활성화되지 않았습니다")
			return
		}
		newStatusStr, ok := newStatus.(string)
		if !ok {
			writeError(w, http.StatusBadRequest, "_status는 문자열이어야 합니다")
			return
		}
		// Fetch current status.
		qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
		var currentStatus *string
		err := h.pool.QueryRow(r.Context(),
			fmt.Sprintf(`SELECT "_status" FROM %s WHERE id = $1 AND deleted_at IS NULL`, qTable), id,
		).Scan(&currentStatus)
		if err != nil {
			handleErr(w, r, err)
			return
		}
		fromStatus := ""
		if currentStatus != nil {
			fromStatus = *currentStatus
		}
		if err := h.validateStatusTransition(col.ID, fromStatus, newStatusStr); err != nil {
			handleErr(w, r, err)
			return
		}
		sets = append(sets, fmt.Sprintf("%q = $%d", "_status", idx))
		args = append(args, newStatusStr)
		idx++
	}

	args = append(args, id)
	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	selectCols := buildSelectCols(fields, procEnabled)

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

	// Record change history.
	diff := computeDiff(oldRow, records[0], fields)
	if len(diff) > 0 {
		recordChange(r.Context(), h.pool, col.ID, id, user.UserID, user.Name, "update", diff)
	}

	// Resolve computed fields for the updated record.
	h.resolveComputedFields(r.Context(), records, fields)

	writeJSON(w, http.StatusOK, records[0])
}

// --- Aggregate ---

// Aggregate runs simple GROUP BY queries for dashboard widgets.
// Query params:
//
//	group=field_slug   — required, must be a non-relation column on this collection
//	fn=count|sum|avg|min|max — default: count
//	field=field_slug   — required for sum/avg/min/max; ignored for count
//	filter passthrough — same WHERE syntax as List
//
// Supports:
//   - Multiple groups: ?group=status&group=department → GROUP BY status, department
//   - Date interval:   ?group=created_at&interval=month → DATE_TRUNC('month', created_at)
//   - Multiple series: ?fn=count&fn=sum&field=amount → multiple aggregation columns
//
// Response: [{ "groups": [...], "values": { "count": N, "sum_amount": N } }, ...]
// Legacy single-group response: [{ "group": <value>, "value": <number> }, ...]
func (h *DynHandler) Aggregate(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}
	if !h.checkAccess(w, r, col, "entry_view") {
		return
	}

	params := r.URL.Query()
	groupSlugs := params["group"]
	if len(groupSlugs) == 0 {
		writeError(w, http.StatusBadRequest, "group parameter is required")
		return
	}

	bySlug := make(map[string]schema.Field, len(fields))
	for _, f := range fields {
		bySlug[f.Slug] = f
	}

	// Valid date intervals for DATE_TRUNC.
	validIntervals := map[string]bool{
		"year": true, "quarter": true, "month": true, "week": true, "day": true, "hour": true,
	}
	interval := strings.ToLower(params.Get("interval"))
	if interval != "" && !validIntervals[interval] {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid interval %q; must be year/quarter/month/week/day/hour", interval))
		return
	}

	// Auto columns allowed for grouping.
	autoColumns := map[string]bool{"created_at": true, "updated_at": true, "deleted_at": true}

	// Build GROUP BY expressions.
	var groupExprs []string
	var groupAliases []string
	for i, gs := range groupSlugs {
		_, isField := bySlug[gs]
		if !isField && !autoColumns[gs] {
			handleErr(w, r, fmt.Errorf("%w: group field %q not found", schema.ErrInvalidInput, gs))
			return
		}
		alias := fmt.Sprintf("g%d", i)
		qCol := fmt.Sprintf("%q", gs)
		// Apply DATE_TRUNC for timestamp columns with interval.
		if interval != "" && (gs == "created_at" || gs == "updated_at" || gs == "deleted_at" ||
			(isField && (bySlug[gs].FieldType == schema.FieldDate || bySlug[gs].FieldType == schema.FieldDatetime))) {
			groupExprs = append(groupExprs, fmt.Sprintf("DATE_TRUNC('%s', %s) AS %s", interval, qCol, alias))
		} else {
			groupExprs = append(groupExprs, fmt.Sprintf("%s AS %s", qCol, alias))
		}
		groupAliases = append(groupAliases, alias)
	}

	// Build aggregation expressions (support multiple fn + field pairs).
	fns := params["fn"]
	aggFields := params["field"]
	if len(fns) == 0 {
		fns = []string{"count"}
	}

	type aggDef struct {
		expr string
		key  string
	}
	var aggs []aggDef
	for i, fn := range fns {
		fn = strings.ToLower(fn)
		switch fn {
		case "count":
			aggs = append(aggs, aggDef{"COUNT(*)", "count"})
		case "sum", "avg", "min", "max":
			fieldSlug := ""
			if i < len(aggFields) {
				fieldSlug = aggFields[i]
			} else if len(aggFields) > 0 {
				fieldSlug = aggFields[0]
			}
			if fieldSlug == "" {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("%s requires field parameter", fn))
				return
			}
			f, exists := bySlug[fieldSlug]
			if !exists {
				handleErr(w, r, fmt.Errorf("%w: field %q not found", schema.ErrInvalidInput, fieldSlug))
				return
			}
			if f.FieldType != schema.FieldNumber && f.FieldType != schema.FieldInteger && f.FieldType != schema.FieldAutonumber {
				handleErr(w, r, fmt.Errorf("%w: %s requires numeric field, %s is %s",
					schema.ErrInvalidInput, fn, fieldSlug, f.FieldType))
				return
			}
			aggs = append(aggs, aggDef{
				expr: fmt.Sprintf("%s(%q)", strings.ToUpper(fn), fieldSlug),
				key:  fmt.Sprintf("%s_%s", fn, fieldSlug),
			})
		default:
			writeError(w, http.StatusBadRequest, fmt.Sprintf("unknown aggregation function %q", fn))
			return
		}
	}

	where, args, err := ParseFilters(params, fields)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)

	// Build SELECT and GROUP BY clauses.
	var selectParts []string
	selectParts = append(selectParts, groupExprs...)
	for _, a := range aggs {
		selectParts = append(selectParts, a.expr)
	}
	groupByStr := strings.Join(groupAliases, ", ")

	query := fmt.Sprintf(
		"SELECT %s FROM %s WHERE deleted_at IS NULL %s GROUP BY %s ORDER BY %s",
		strings.Join(selectParts, ", "), qTable, where, groupByStr, groupByStr,
	)

	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	defer rows.Close()

	// Single group + single agg: legacy format { group, value }.
	isLegacy := len(groupSlugs) == 1 && len(aggs) == 1

	if isLegacy {
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
		return
	}

	// Multi-group or multi-series: { groups: [...], values: { key: val } }.
	type multiBucket struct {
		Groups []any          `json:"groups"`
		Values map[string]any `json:"values"`
	}
	var result []multiBucket
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			handleErr(w, r, err)
			return
		}
		groups := make([]any, len(groupSlugs))
		for i := range groupSlugs {
			groups[i] = normalizeValue(vals[i])
		}
		values := make(map[string]any, len(aggs))
		for i, a := range aggs {
			values[a.key] = normalizeValue(vals[len(groupSlugs)+i])
		}
		result = append(result, multiBucket{Groups: groups, Values: values})
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
	if !h.checkAccess(w, r, col, "entry_create") {
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
	bulkProcEnabled := h.hasProcessEnabled(col.ID)
	selectCols := buildSelectCols(fields, bulkProcEnabled)

	// Inject initial status for bulk create if process is enabled.
	if bulkProcEnabled {
		if initStatus := h.initialStatusName(col.ID); initStatus != "" {
			for i := range bodies {
				bodies[i]["_status"] = initStatus
			}
		}
	}

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
	if !h.checkAccess(w, r, col, "entry_delete") {
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
		if f.FieldType.NoColumn() || f.FieldType == schema.FieldAutonumber {
			continue
		}
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
		idx++
	}
	if st, ok := body["_status"]; ok {
		cols = append(cols, `"_status"`)
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		args = append(args, st)
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
	if !h.checkAccess(w, r, col, "entry_delete") {
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

	// Record change history.
	user, _ := middleware.GetUser(r.Context())
	recordChange(r.Context(), h.pool, col.ID, id, user.UserID, user.Name, "delete", map[string]any{"_deleted": true})

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// --- helpers ---

// checkAccess verifies the current user is allowed the given operation
// on the collection's access_config. Returns false and writes a 403 if denied.
func (h *DynHandler) checkAccess(w http.ResponseWriter, r *http.Request, col schema.Collection, operation string) bool {
	user, ok := middleware.GetUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return false
	}
	// Directors always have full access.
	if user.Role == "director" {
		return true
	}
	if !col.AccessConfig.AllowsRole(operation, user.Role) {
		writeError(w, http.StatusForbidden, "access denied for this collection")
		return false
	}
	return true
}

func (h *DynHandler) resolveCollection(w http.ResponseWriter, slug string) (schema.Collection, []schema.Field, bool) {
	col, ok := h.cache.CollectionBySlug(slug)
	if !ok {
		writeError(w, http.StatusNotFound, fmt.Sprintf("collection %q not found", slug))
		return schema.Collection{}, nil, false
	}
	fields := h.cache.Fields(col.ID)
	return col, fields, true
}

// hasProcessEnabled checks if the collection has an active process workflow.
func (h *DynHandler) hasProcessEnabled(collectionID string) bool {
	p, ok := h.cache.ProcessByCollectionID(collectionID)
	return ok && p.IsEnabled
}

// initialStatusName returns the name of the initial status for a collection's process.
func (h *DynHandler) initialStatusName(collectionID string) string {
	p, ok := h.cache.ProcessByCollectionID(collectionID)
	if !ok {
		return ""
	}
	for _, s := range p.Statuses {
		if s.IsInitial {
			return s.Name
		}
	}
	return ""
}

// validateStatusTransition checks if a status transition is allowed.
func (h *DynHandler) validateStatusTransition(collectionID, fromStatus, toStatus string) error {
	p, ok := h.cache.ProcessByCollectionID(collectionID)
	if !ok || !p.IsEnabled {
		return fmt.Errorf("%w: 이 컬렉션에는 프로세스가 활성화되지 않았습니다", schema.ErrInvalidInput)
	}

	// Build status ID lookup.
	nameToID := make(map[string]string, len(p.Statuses))
	for _, s := range p.Statuses {
		nameToID[s.Name] = s.ID
	}

	fromID, ok := nameToID[fromStatus]
	if !ok {
		return fmt.Errorf("%w: 현재 상태 %q를 찾을 수 없습니다", schema.ErrInvalidInput, fromStatus)
	}
	toID, ok := nameToID[toStatus]
	if !ok {
		return fmt.Errorf("%w: 대상 상태 %q를 찾을 수 없습니다", schema.ErrInvalidInput, toStatus)
	}

	for _, t := range p.Transitions {
		if t.FromStatusID == fromID && t.ToStatusID == toID {
			return nil // transition allowed
		}
	}

	// Build list of allowed transitions for the error message.
	var allowed []string
	for _, t := range p.Transitions {
		if t.FromStatusID == fromID {
			for _, s := range p.Statuses {
				if s.ID == t.ToStatusID {
					allowed = append(allowed, fmt.Sprintf("%s (%s)", s.Name, t.Label))
				}
			}
		}
	}
	return fmt.Errorf("%w: %q → %q 전이가 허용되지 않습니다. 허용: %v",
		schema.ErrInvalidInput, fromStatus, toStatus, allowed)
}

func buildSelectCols(fields []schema.Field, hasStatus ...bool) string {
	cols := []string{`"id"`}
	for _, f := range fields {
		if f.FieldType.NoColumn() {
			continue
		}
		cols = append(cols, fmt.Sprintf("%q", f.Slug))
	}
	cols = append(cols, `"created_at"`, `"updated_at"`, `"created_by"`, `"updated_by"`, `"deleted_at"`)
	if len(hasStatus) > 0 && hasStatus[0] {
		cols = append(cols, `"_status"`)
	}
	return strings.Join(cols, ", ")
}

// qualifySelectCols returns the same column list but each column qualified
// with the given table prefix and aliased back to its bare name so the
// row scanner sees the same field names.
func qualifySelectCols(fields []schema.Field, prefix string, hasStatus ...bool) string {
	cols := []string{fmt.Sprintf(`%s.%q AS %q`, prefix, "id", "id")}
	for _, f := range fields {
		if f.FieldType.NoColumn() {
			continue
		}
		cols = append(cols, fmt.Sprintf(`%s.%q AS %q`, prefix, f.Slug, f.Slug))
	}
	for _, sysCol := range []string{"created_at", "updated_at", "created_by", "updated_by", "deleted_at"} {
		cols = append(cols, fmt.Sprintf(`%s.%q AS %q`, prefix, sysCol, sysCol))
	}
	if len(hasStatus) > 0 && hasStatus[0] {
		cols = append(cols, fmt.Sprintf(`%s.%q AS %q`, prefix, "_status", "_status"))
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
			name := descs[i].Name
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

// fetchRow loads a single record by ID. Used for pre-update comparisons.
func (h *DynHandler) fetchRow(ctx context.Context, col schema.Collection, fields []schema.Field, id string) (map[string]any, error) {
	qTable := fmt.Sprintf("%q.%q", "data", col.Slug)
	selectCols := buildSelectCols(fields)
	sql := fmt.Sprintf("SELECT %s FROM %s WHERE id = $1 AND deleted_at IS NULL", selectCols, qTable)
	rows, err := h.pool.Query(ctx, sql, id)
	if err != nil {
		return nil, err
	}
	records, err := collectRows(rows)
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("record %s: %w", id, schema.ErrNotFound)
	}
	return records[0], nil
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
