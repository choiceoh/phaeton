package handler

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// reserved query params — not treated as field filters.
var reservedParams = map[string]bool{
	"sort": true, "page": true, "limit": true, "confirm": true, "expand": true, "q": true,
}

// BuildSearchClause generates an ILIKE-based full-text search condition across
// all text/textarea fields. Returns empty string and nil args if q is empty.
func BuildSearchClause(q string, fields []schema.Field, prefix string, argStart int) (clause string, args []any) {
	if q == "" {
		return "", nil
	}
	var conditions []string
	for _, f := range fields {
		if f.FieldType != schema.FieldText && f.FieldType != schema.FieldTextarea {
			continue
		}
		var qCol string
		if prefix != "" {
			qCol = fmt.Sprintf(`%s."%s"`, prefix, f.Slug)
		} else {
			qCol = fmt.Sprintf("%q", f.Slug)
		}
		conditions = append(conditions, fmt.Sprintf("%s ILIKE $%d", qCol, argStart))
	}
	if len(conditions) == 0 {
		return "", nil
	}
	return "AND (" + strings.Join(conditions, " OR ") + ")", []any{"%" + q + "%"}
}

// ParseFilters converts query params into a WHERE clause with parameterised args.
// Only field slugs present in `fields` are accepted; unknown params are silently ignored.
//
// Equivalent to ParseFiltersWithPrefix(params, fields, "").
func ParseFilters(params url.Values, fields []schema.Field) (where string, args []any, err error) {
	return ParseFiltersWithPrefix(params, fields, "")
}

// ParseFiltersWithPrefix is the prefixed variant. When `prefix` is non-empty
// (e.g. `"data"."projects"`), generated columns are qualified as
// `prefix."col"` so they remain unambiguous in JOIN queries.
func ParseFiltersWithPrefix(params url.Values, fields []schema.Field, prefix string) (where string, args []any, err error) {
	valid := make(map[string]schema.FieldType, len(fields))
	for _, f := range fields {
		valid[f.Slug] = f.FieldType
	}

	var conditions []string
	argIdx := 1

	for key, vals := range params {
		if reservedParams[key] {
			continue
		}
		if _, ok := valid[key]; !ok {
			continue
		}
		raw := vals[0]

		parts := strings.SplitN(raw, ":", 2)
		if len(parts) != 2 {
			return "", nil, fmt.Errorf("invalid filter format for %q: expected op:value", key)
		}
		op, operand := parts[0], parts[1]
		var qCol string
		if prefix != "" {
			qCol = fmt.Sprintf(`%s."%s"`, prefix, key)
		} else {
			qCol = fmt.Sprintf("%q", key)
		}

		switch op {
		case "eq":
			conditions = append(conditions, fmt.Sprintf("%s = $%d", qCol, argIdx))
			args = append(args, operand)
			argIdx++
		case "neq":
			conditions = append(conditions, fmt.Sprintf("%s != $%d", qCol, argIdx))
			args = append(args, operand)
			argIdx++
		case "gt":
			conditions = append(conditions, fmt.Sprintf("%s > $%d", qCol, argIdx))
			args = append(args, operand)
			argIdx++
		case "gte":
			conditions = append(conditions, fmt.Sprintf("%s >= $%d", qCol, argIdx))
			args = append(args, operand)
			argIdx++
		case "lt":
			conditions = append(conditions, fmt.Sprintf("%s < $%d", qCol, argIdx))
			args = append(args, operand)
			argIdx++
		case "lte":
			conditions = append(conditions, fmt.Sprintf("%s <= $%d", qCol, argIdx))
			args = append(args, operand)
			argIdx++
		case "like":
			conditions = append(conditions, fmt.Sprintf("%s ILIKE $%d", qCol, argIdx))
			args = append(args, "%"+operand+"%")
			argIdx++
		case "in":
			// Split comma-separated values into an array parameter.
			vals := strings.Split(operand, ",")
			placeholders := make([]string, len(vals))
			for i, v := range vals {
				placeholders[i] = fmt.Sprintf("$%d", argIdx)
				args = append(args, v)
				argIdx++
			}
			conditions = append(conditions, fmt.Sprintf("%s IN (%s)", qCol, strings.Join(placeholders, ",")))
		case "is_null":
			if operand == "true" {
				conditions = append(conditions, fmt.Sprintf("%s IS NULL", qCol))
			} else {
				conditions = append(conditions, fmt.Sprintf("%s IS NOT NULL", qCol))
			}
		default:
			return "", nil, fmt.Errorf("unknown filter operator %q for field %q", op, key)
		}
	}

	if len(conditions) > 0 {
		where = "AND " + strings.Join(conditions, " AND ")
	}
	return where, args, nil
}

// ParseSort converts the "sort" query param into an ORDER BY clause for the
// owning table only. For relation-aware sorting use ParseSortWithRelations.
//
// Format: "-field" for DESC, "field" for ASC. Multiple comma-separated.
func ParseSort(param string, fields []schema.Field) string {
	clause, _ := ParseSortWithRelations(param, fields, nil)
	return clause
}

// SortJoin describes a single LEFT JOIN that has to be added to a query
// because the sort spec referenced a relation field via dot notation.
type SortJoin struct {
	Alias       string // safe alias used in the SQL ("rel0", "rel1", ...)
	TargetTable string // already-quoted "data"."subsidiaries"
	OwnerColumn string // owning column slug (e.g. "subsidiary")
}

// ParseSortWithRelations supports dot-notation like "-subsidiary.name" by
// generating LEFT JOIN clauses against the related table. The `cache` is used
// to look up the target collection's slug; pass nil to disable relation sort.
func ParseSortWithRelations(param string, fields []schema.Field, resolveRelation func(field schema.Field) (targetTable string, ok bool)) (orderBy string, joins []SortJoin) {
	if param == "" {
		return "ORDER BY created_at DESC", nil
	}

	bySlug := make(map[string]schema.Field, len(fields))
	for _, f := range fields {
		bySlug[f.Slug] = f
	}
	autoCols := map[string]bool{
		"id": true, "created_at": true, "updated_at": true,
	}

	var parts []string
	joinIdx := 0
	for _, raw := range strings.Split(param, ",") {
		s := strings.TrimSpace(raw)
		if s == "" {
			continue
		}
		dir := "ASC"
		expr := s
		if strings.HasPrefix(s, "-") {
			dir = "DESC"
			expr = s[1:]
		}

		// Dot notation: <relation>.<target_field>
		if dot := strings.IndexByte(expr, '.'); dot >= 0 && resolveRelation != nil {
			ownerSlug := expr[:dot]
			targetSlug := expr[dot+1:]
			f, ok := bySlug[ownerSlug]
			if !ok || f.FieldType != schema.FieldRelation {
				continue
			}
			targetTable, ok := resolveRelation(f)
			if !ok {
				continue
			}
			alias := fmt.Sprintf("rel%d", joinIdx)
			joinIdx++
			joins = append(joins, SortJoin{
				Alias:       alias,
				TargetTable: targetTable,
				OwnerColumn: ownerSlug,
			})
			parts = append(parts, fmt.Sprintf("%s.%q %s", alias, targetSlug, dir))
			continue
		}

		// Plain column on the owner table.
		if _, ok := bySlug[expr]; !ok && !autoCols[expr] {
			continue
		}
		parts = append(parts, fmt.Sprintf("%q %s", expr, dir))
	}

	if len(parts) == 0 {
		return "ORDER BY created_at DESC", nil
	}
	return "ORDER BY " + strings.Join(parts, ", "), joins
}

// ParsePagination extracts page and limit from query params.
func ParsePagination(params url.Values) (page, limit, offset int) {
	page = 1
	limit = 20

	if p, err := strconv.Atoi(params.Get("page")); err == nil && p > 0 {
		page = p
	}
	if l, err := strconv.Atoi(params.Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	offset = (page - 1) * limit
	return page, limit, offset
}
