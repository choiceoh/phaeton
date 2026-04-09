package api

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"phaeton/internal/schema"
)

// reserved query params — not treated as field filters.
var reservedParams = map[string]bool{
	"sort": true, "page": true, "limit": true, "confirm": true, "expand": true,
}

// ParseFilters converts query params into a WHERE clause with parameterised args.
// Only field slugs present in `fields` are accepted; unknown params are silently ignored.
func ParseFilters(params url.Values, fields []schema.Field) (where string, args []any, err error) {
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
		qCol := fmt.Sprintf("%q", key) // quoted identifier

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

// ParseSort converts the "sort" query param into an ORDER BY clause.
// Format: "-field" for DESC, "field" for ASC. Multiple comma-separated.
func ParseSort(param string, fields []schema.Field) string {
	if param == "" {
		return "ORDER BY created_at DESC"
	}

	valid := make(map[string]bool, len(fields))
	for _, f := range fields {
		valid[f.Slug] = true
	}
	// Also allow system columns.
	valid["created_at"] = true
	valid["updated_at"] = true
	valid["id"] = true

	var parts []string
	for _, s := range strings.Split(param, ",") {
		s = strings.TrimSpace(s)
		dir := "ASC"
		col := s
		if strings.HasPrefix(s, "-") {
			dir = "DESC"
			col = s[1:]
		}
		if !valid[col] {
			continue
		}
		parts = append(parts, fmt.Sprintf("%q %s", col, dir))
	}

	if len(parts) == 0 {
		return "ORDER BY created_at DESC"
	}
	return "ORDER BY " + strings.Join(parts, ", ")
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
