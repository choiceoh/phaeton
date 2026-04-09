package engine

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/pgutil"
)

// Entry is the denormalised shape of a single data row as returned
// by the CRUD methods. Keys are column names; values are the Go
// types produced by the driver after normaliseValue runs.
type Entry map[string]any

// QueryRequest bundles every knob QueryEntries accepts. It is a
// plain struct (not a builder) so callers can construct it inline
// from JSON or query-string parsers.
type QueryRequest struct {
	Filters []Filter
	Sort    []SortSpec
	Limit   int // defaults to 20, capped at 500
	Offset  int // non-negative
}

// QueryResult is the return value of QueryEntries. Total counts all
// rows matching the filters (ignoring pagination).
type QueryResult struct {
	Rows  []Entry
	Total int64
}

// AggregateSpec describes a single aggregate query. Multiple metrics
// can share the same GroupBy; the result is one Entry per group with
// the metric aliases as additional keys.
type AggregateSpec struct {
	Metrics []AggMetric
	GroupBy []string
	Filters []Filter
}

// AggMetric is a single aggregate column in the select list.
// Op is one of count, sum, avg, min, max. Field is the column being
// aggregated (or empty for count(*)). Alias becomes the map key in
// the returned row.
type AggMetric struct {
	Op    string
	Field string
	Alias string
}

var validAggOps = map[string]bool{
	"count": true, "sum": true, "avg": true, "min": true, "max": true,
}

// ---------------------------------------------------------------------
// CreateEntry
// ---------------------------------------------------------------------

// CreateEntry inserts one row into the data.<slug> table for the given
// collection and returns the generated id along with the canonical
// row. The body is validated field-by-field; unknown keys, missing
// required fields, and type mismatches fail fast with ValidationError.
func (e *Engine) CreateEntry(ctx context.Context, collectionID string, body map[string]any) (Entry, error) {
	snap, err := e.loadSchema(ctx, collectionID)
	if err != nil {
		return nil, err
	}
	coerced, err := validateAndCoerce(body, snap, true)
	if err != nil {
		return nil, err
	}

	// Build the INSERT column list from the coerced map so the
	// caller only pays for fields they actually supplied. We still
	// go through snap.Fields order so the generated SQL is stable
	// across runs (helpful for query plan reuse).
	cols := make([]string, 0, len(coerced))
	placeholders := make([]string, 0, len(coerced))
	args := make([]any, 0, len(coerced))
	idx := 1
	for i := range snap.Fields {
		slug := snap.Fields[i].Slug
		v, ok := coerced[slug]
		if !ok {
			continue
		}
		cols = append(cols, quoteIdent(slug))
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		args = append(args, v)
		idx++
	}

	// If the caller supplied nothing, we still need to produce a
	// row (defaults + id). An empty column list is valid PostgreSQL
	// via DEFAULT VALUES.
	var sql string
	if len(cols) == 0 {
		sql = fmt.Sprintf(
			"INSERT INTO %s DEFAULT VALUES RETURNING %s",
			snap.qualifiedTable(),
			snap.selectCols(),
		)
	} else {
		sql = fmt.Sprintf(
			"INSERT INTO %s (%s) VALUES (%s) RETURNING %s",
			snap.qualifiedTable(),
			joinComma(cols),
			joinComma(placeholders),
			snap.selectCols(),
		)
	}

	rows, err := e.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("insert %s: %w", snap.Slug, err)
	}
	defer rows.Close()

	entries, err := collectRows(rows)
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("insert returned no rows")
	}
	return entries[0], nil
}

// ---------------------------------------------------------------------
// GetEntry
// ---------------------------------------------------------------------

// GetEntry returns one row by id. Soft-deleted rows (deleted_at IS
// NOT NULL) are treated as not found so callers don't accidentally
// resurrect them.
func (e *Engine) GetEntry(ctx context.Context, collectionID, id string) (Entry, error) {
	snap, err := e.loadSchema(ctx, collectionID)
	if err != nil {
		return nil, err
	}
	uid := pgutil.ParseUUID(id)
	if !uid.Valid {
		return nil, &ValidationError{Field: "id", Message: "invalid UUID"}
	}

	sql := fmt.Sprintf(
		"SELECT %s FROM %s WHERE %s = $1 AND %s IS NULL",
		snap.selectCols(),
		snap.qualifiedTable(),
		quoteIdent("id"),
		quoteIdent("deleted_at"),
	)
	rows, err := e.pool.Query(ctx, sql, uid)
	if err != nil {
		return nil, fmt.Errorf("select %s: %w", snap.Slug, err)
	}
	defer rows.Close()

	entries, err := collectRows(rows)
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, ErrNotFound
	}
	return entries[0], nil
}

// ---------------------------------------------------------------------
// QueryEntries
// ---------------------------------------------------------------------

// QueryEntries runs a paginated SELECT across the collection. It
// returns both the page of rows and the total count of rows matching
// the filters (for UI pagination). Soft-deleted rows are always
// excluded — callers cannot opt out.
//
// The two queries (COUNT + SELECT) share the same argument slice and
// run sequentially. pgx's default session has no prepared-statement
// cache across calls, so the overhead is one extra round-trip.
func (e *Engine) QueryEntries(ctx context.Context, collectionID string, req QueryRequest) (*QueryResult, error) {
	snap, err := e.loadSchema(ctx, collectionID)
	if err != nil {
		return nil, err
	}

	limit, offset := normalizePage(req.Limit, req.Offset)

	where, args, _, err := buildWhereClause(snap, req.Filters, 1, nil)
	if err != nil {
		return nil, err
	}
	orderBy, err := buildOrderBy(snap, req.Sort)
	if err != nil {
		return nil, err
	}

	base := fmt.Sprintf(
		"FROM %s WHERE %s IS NULL%s",
		snap.qualifiedTable(),
		quoteIdent("deleted_at"),
		where,
	)

	// Count first. This round-trip is cheap compared to the data
	// query and lets the caller drive pagination UIs without a
	// second request.
	var total int64
	countSQL := "SELECT COUNT(*) " + base
	if err := e.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count %s: %w", snap.Slug, err)
	}

	dataSQL := fmt.Sprintf(
		"SELECT %s %s %s LIMIT %d OFFSET %d",
		snap.selectCols(), base, orderBy, limit, offset,
	)
	rows, err := e.pool.Query(ctx, dataSQL, args...)
	if err != nil {
		return nil, fmt.Errorf("select %s: %w", snap.Slug, err)
	}
	defer rows.Close()

	entries, err := collectRows(rows)
	if err != nil {
		return nil, err
	}
	return &QueryResult{Rows: entries, Total: total}, nil
}

// ---------------------------------------------------------------------
// UpdateEntry
// ---------------------------------------------------------------------

// UpdateEntry applies a partial patch to a single row and returns the
// full updated row. Only keys present in body are touched; everything
// else is left alone. Soft-deleted rows cannot be updated.
func (e *Engine) UpdateEntry(ctx context.Context, collectionID, id string, body map[string]any) (Entry, error) {
	snap, err := e.loadSchema(ctx, collectionID)
	if err != nil {
		return nil, err
	}
	uid := pgutil.ParseUUID(id)
	if !uid.Valid {
		return nil, &ValidationError{Field: "id", Message: "invalid UUID"}
	}
	coerced, err := validateAndCoerce(body, snap, false)
	if err != nil {
		return nil, err
	}
	if len(coerced) == 0 {
		// Nothing to update: surface the current row instead of
		// emitting a no-op SQL statement.
		return e.GetEntry(ctx, collectionID, id)
	}

	sets := make([]string, 0, len(coerced)+1)
	args := make([]any, 0, len(coerced)+1)
	idx := 1
	for i := range snap.Fields {
		slug := snap.Fields[i].Slug
		v, ok := coerced[slug]
		if !ok {
			continue
		}
		sets = append(sets, fmt.Sprintf("%s = $%d", quoteIdent(slug), idx))
		args = append(args, v)
		idx++
	}
	// Always bump updated_at.
	sets = append(sets, fmt.Sprintf("%s = now()", quoteIdent("updated_at")))
	args = append(args, uid)

	sql := fmt.Sprintf(
		"UPDATE %s SET %s WHERE %s = $%d AND %s IS NULL RETURNING %s",
		snap.qualifiedTable(),
		strings.Join(sets, ", "),
		quoteIdent("id"), idx,
		quoteIdent("deleted_at"),
		snap.selectCols(),
	)
	rows, err := e.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("update %s: %w", snap.Slug, err)
	}
	defer rows.Close()

	entries, err := collectRows(rows)
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, ErrNotFound
	}
	return entries[0], nil
}

// ---------------------------------------------------------------------
// DeleteEntry
// ---------------------------------------------------------------------

// DeleteEntry soft-deletes a row by setting deleted_at = now(). A
// hard delete is intentionally not exposed: the migration engine's
// rollback story relies on deleted_at being reversible.
func (e *Engine) DeleteEntry(ctx context.Context, collectionID, id string) error {
	snap, err := e.loadSchema(ctx, collectionID)
	if err != nil {
		return err
	}
	uid := pgutil.ParseUUID(id)
	if !uid.Valid {
		return &ValidationError{Field: "id", Message: "invalid UUID"}
	}

	sql := fmt.Sprintf(
		"UPDATE %s SET %s = now() WHERE %s = $1 AND %s IS NULL",
		snap.qualifiedTable(),
		quoteIdent("deleted_at"),
		quoteIdent("id"),
		quoteIdent("deleted_at"),
	)
	tag, err := e.pool.Exec(ctx, sql, uid)
	if err != nil {
		return fmt.Errorf("delete %s: %w", snap.Slug, err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------
// AggregateEntries
// ---------------------------------------------------------------------

// AggregateEntries runs a GROUP BY query with one or more metrics.
// The result is a list of Entry values; each entry contains the
// GroupBy columns plus one key per metric alias.
//
// Example:
//
//	AggregateSpec{
//	    Metrics: []AggMetric{
//	        {Op: "count", Alias: "n"},
//	        {Op: "sum", Field: "amount", Alias: "total"},
//	    },
//	    GroupBy: []string{"status"},
//	    Filters: []Filter{{Field: "created_at", Op: OpGte, Value: since}},
//	}
//
// produces rows like {"status": "paid", "n": 12, "total": 340000.0}.
func (e *Engine) AggregateEntries(ctx context.Context, collectionID string, spec AggregateSpec) ([]Entry, error) {
	snap, err := e.loadSchema(ctx, collectionID)
	if err != nil {
		return nil, err
	}
	if len(spec.Metrics) == 0 {
		return nil, &ValidationError{Field: "metrics", Message: "at least one metric required"}
	}

	known := snap.knownColumns()
	selectParts := make([]string, 0, len(spec.GroupBy)+len(spec.Metrics))

	// GROUP BY columns come first in the select list so that scan
	// order matches the struct layout — callers that iterate row
	// values see group keys before metric values.
	for _, g := range spec.GroupBy {
		if _, ok := known[g]; !ok {
			return nil, &ValidationError{Field: g, Message: "unknown field for group_by"}
		}
		selectParts = append(selectParts, quoteIdent(g))
	}

	for _, m := range spec.Metrics {
		if !validAggOps[m.Op] {
			return nil, &ValidationError{
				Field:   "metrics",
				Message: fmt.Sprintf("unknown op %q", m.Op),
			}
		}
		if m.Alias == "" {
			return nil, &ValidationError{Field: "metrics", Message: "alias required"}
		}
		// Alias goes through quoteIdent too: it ends up as the
		// column header which pgx reads via rows.FieldDescriptions
		// and we turn into the Entry key.
		var expr string
		if m.Op == "count" && m.Field == "" {
			expr = "count(*)"
		} else {
			if _, ok := known[m.Field]; !ok {
				return nil, &ValidationError{Field: m.Field, Message: "unknown field for metric"}
			}
			expr = fmt.Sprintf("%s(%s)", m.Op, quoteIdent(m.Field))
		}
		selectParts = append(selectParts, fmt.Sprintf("%s AS %s", expr, quoteIdent(m.Alias)))
	}

	where, args, _, err := buildWhereClause(snap, spec.Filters, 1, nil)
	if err != nil {
		return nil, err
	}

	sql := fmt.Sprintf(
		"SELECT %s FROM %s WHERE %s IS NULL%s",
		joinComma(selectParts),
		snap.qualifiedTable(),
		quoteIdent("deleted_at"),
		where,
	)
	if len(spec.GroupBy) > 0 {
		groupCols := make([]string, 0, len(spec.GroupBy))
		for _, g := range spec.GroupBy {
			groupCols = append(groupCols, quoteIdent(g))
		}
		sql += " GROUP BY " + joinComma(groupCols)
		// Deterministic order for tests. Drop entirely if the
		// caller wants an explicit sort later.
		sql += " ORDER BY " + joinComma(groupCols)
	}

	rows, err := e.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("aggregate %s: %w", snap.Slug, err)
	}
	defer rows.Close()

	return collectRows(rows)
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

// normalizePage clamps user-supplied pagination into safe defaults.
// Limit tops out at 500 so a single request cannot scan the whole
// table; offset floors at 0.
func normalizePage(limit, offset int) (int, int) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// collectRows drains pgx.Rows into a slice of Entry maps, running
// normaliseValue on every cell so callers get friendly Go types
// (strings, floats, time.Time) instead of pgtype wrappers.
func collectRows(rows pgx.Rows) ([]Entry, error) {
	var out []Entry
	for rows.Next() {
		descs := rows.FieldDescriptions()
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		row := make(Entry, len(vals))
		for i, v := range vals {
			row[string(descs[i].Name)] = normaliseValue(v)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// normaliseValue converts pgx driver types into plain Go values that
// marshal cleanly through json.Marshal. Unknown types fall through
// unchanged.
func normaliseValue(v any) any {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case [16]byte:
		return pgutil.FormatUUID(val)
	case pgtype.UUID:
		return pgutil.UUIDToString(val)
	case pgtype.Numeric:
		// pgtype.Numeric.Float64Value is the canonical float
		// accessor; it sets Valid=false when the source is NULL.
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
	}
	return v
}
