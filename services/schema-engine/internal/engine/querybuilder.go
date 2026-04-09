package engine

import (
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// quoteIdent wraps a single PostgreSQL identifier in double quotes,
// doubling any embedded quote. It defers to pgx.Identifier.Sanitize,
// which is the canonical safe quoter for the driver.
//
// We only ever call this on names that have already been validated
// against schema.ValidateSlug, so in practice no escaping is ever
// required. The extra layer is defence in depth — if validation is
// loosened later, quoteIdent still blocks injection.
func quoteIdent(name string) string {
	return pgx.Identifier{name}.Sanitize()
}

// joinComma is a tiny helper used by selectCols and the INSERT /
// UPDATE builders. It is a trivial strings.Join wrapper but keeps
// call sites terse.
func joinComma(parts []string) string { return strings.Join(parts, ", ") }

// Filter is one predicate in a QueryEntries request. The public API
// never accepts arbitrary SQL fragments; the caller picks from the
// FilterOp whitelist and supplies values which go through pgx as
// parameters.
type Filter struct {
	Field string
	Op    FilterOp
	Value any
}

// FilterOp enumerates the supported comparison operators. Any string
// outside this whitelist is rejected by buildWhereClause — this is
// the only place the value is consulted, so no unvalidated op can
// reach the SQL string.
type FilterOp string

const (
	OpEq     FilterOp = "eq"
	OpNeq    FilterOp = "neq"
	OpGt     FilterOp = "gt"
	OpGte    FilterOp = "gte"
	OpLt     FilterOp = "lt"
	OpLte    FilterOp = "lte"
	OpLike   FilterOp = "like"
	OpIn     FilterOp = "in"
	OpIsNull FilterOp = "is_null"
)

var validOps = map[FilterOp]string{
	OpEq:   "=",
	OpNeq:  "!=",
	OpGt:   ">",
	OpGte:  ">=",
	OpLt:   "<",
	OpLte:  "<=",
	OpLike: "ILIKE",
}

// whereBuilder threads a placeholder counter through multiple calls
// so buildWhereClause can append args to an existing args slice (the
// data layer re-uses the same slice between the base predicate and
// the user filters).
type whereBuilder struct {
	parts []string
	args  []any
	idx   int
}

func newWhereBuilder(startIdx int, initialArgs []any) *whereBuilder {
	return &whereBuilder{args: initialArgs, idx: startIdx}
}

// appendParam records one parameter and returns its placeholder
// string ("$N"). It increments the internal counter so subsequent
// calls receive the next placeholder.
func (b *whereBuilder) appendParam(v any) string {
	b.args = append(b.args, v)
	s := fmt.Sprintf("$%d", b.idx)
	b.idx++
	return s
}

// addLiteral appends a predicate that uses no parameter (IS NULL, IS
// NOT NULL). Kept separate from appendParam to keep the builder's
// intent visible at the call site.
func (b *whereBuilder) addLiteral(sql string) { b.parts = append(b.parts, sql) }

// buildWhereClause validates a list of Filter structs against the
// schema and turns them into a parameterised WHERE fragment. The
// returned string is either empty or begins with " AND " so it can
// be concatenated onto a caller-provided base (for example
// "deleted_at IS NULL").
//
// Rejected inputs:
//   - Unknown field name (not in snap.knownColumns)
//   - Unknown operator (not in validOps and not is_null)
//   - IN operator without a []any value
func buildWhereClause(
	snap *AppSchema,
	filters []Filter,
	startIdx int,
	initialArgs []any,
) (string, []any, int, error) {
	b := newWhereBuilder(startIdx, initialArgs)
	known := snap.knownColumns()

	for _, f := range filters {
		if _, ok := known[f.Field]; !ok {
			return "", nil, 0, &ValidationError{
				Field:   f.Field,
				Message: "unknown field for filter",
			}
		}
		qCol := quoteIdent(f.Field)

		if sym, ok := validOps[f.Op]; ok {
			// Simple binary operator: col OP $N.
			// For LIKE we wrap the value in % on both sides
			// so the caller can pass a plain substring.
			val := f.Value
			if f.Op == OpLike {
				s, isStr := f.Value.(string)
				if !isStr {
					return "", nil, 0, &ValidationError{
						Field:   f.Field,
						Message: "like requires a string value",
					}
				}
				val = "%" + s + "%"
			}
			placeholder := b.appendParam(val)
			b.addLiteral(fmt.Sprintf("%s %s %s", qCol, sym, placeholder))
			continue
		}

		switch f.Op {
		case OpIn:
			arr, ok := f.Value.([]any)
			if !ok {
				return "", nil, 0, &ValidationError{
					Field:   f.Field,
					Message: "in requires []any value",
				}
			}
			if len(arr) == 0 {
				// An empty IN list would produce `col IN ()` which
				// is a syntax error in PostgreSQL. We short-circuit
				// with the constant-false predicate so the whole
				// query returns zero rows, matching SQL semantics.
				b.addLiteral("FALSE")
				continue
			}
			placeholders := make([]string, 0, len(arr))
			for _, v := range arr {
				placeholders = append(placeholders, b.appendParam(v))
			}
			b.addLiteral(fmt.Sprintf("%s IN (%s)", qCol, joinComma(placeholders)))

		case OpIsNull:
			// Accept bool; treat missing as is_null true.
			wantNull, _ := f.Value.(bool)
			if wantNull {
				b.addLiteral(fmt.Sprintf("%s IS NULL", qCol))
			} else {
				b.addLiteral(fmt.Sprintf("%s IS NOT NULL", qCol))
			}

		default:
			return "", nil, 0, &ValidationError{
				Field:   f.Field,
				Message: fmt.Sprintf("unknown operator %q", f.Op),
			}
		}
	}

	if len(b.parts) == 0 {
		return "", b.args, b.idx, nil
	}
	return " AND " + strings.Join(b.parts, " AND "), b.args, b.idx, nil
}

// SortSpec is one entry in a QueryEntries order clause.
type SortSpec struct {
	Field string
	Desc  bool
}

// buildOrderBy validates each sort field against the schema and
// produces an ORDER BY fragment. Unknown fields are rejected rather
// than silently dropped so the caller notices typos immediately.
func buildOrderBy(snap *AppSchema, sorts []SortSpec) (string, error) {
	if len(sorts) == 0 {
		// Default ordering: newest first. Stable enough for most
		// callers; explicit sort lists win when supplied.
		return fmt.Sprintf("ORDER BY %s DESC", quoteIdent("created_at")), nil
	}
	known := snap.knownColumns()
	parts := make([]string, 0, len(sorts))
	for _, s := range sorts {
		if _, ok := known[s.Field]; !ok {
			return "", &ValidationError{
				Field:   s.Field,
				Message: "unknown field for sort",
			}
		}
		dir := "ASC"
		if s.Desc {
			dir = "DESC"
		}
		parts = append(parts, quoteIdent(s.Field)+" "+dir)
	}
	return "ORDER BY " + joinComma(parts), nil
}
