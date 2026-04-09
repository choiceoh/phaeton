package engine

import (
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/pgutil"
	"github.com/choiceoh/phaeton/services/schema-engine/internal/schema"
)

// validateAndCoerce walks the user-supplied payload once, filters out
// unknown keys (they would point to nonexistent columns), enforces
// required fields on insert, and coerces every value into the
// concrete Go type that pgx can bind for the underlying column.
//
// Its output is a map keyed by column name — ready to feed directly
// into the INSERT / UPDATE builder in data.go.
//
// isInsert toggles required-field enforcement: an UPDATE should only
// validate the fields actually present in the patch.
func validateAndCoerce(
	body map[string]any,
	snap *AppSchema,
	isInsert bool,
) (map[string]any, error) {
	// Reject unknown keys up front. Silently ignoring them is a
	// common source of bugs where a typo like "isdone" silently
	// maps to nothing and the caller thinks the update worked.
	for key := range body {
		if _, ok := snap.ByName[key]; !ok {
			return nil, &ValidationError{Field: key, Message: "unknown field"}
		}
	}

	out := make(map[string]any, len(body))
	for i := range snap.Fields {
		f := &snap.Fields[i]
		raw, present := body[f.Slug]

		// Required enforcement only runs on insert. On update,
		// missing keys mean "leave the column alone".
		if !present {
			if isInsert && f.IsRequired {
				return nil, &ValidationError{Field: f.Slug, Message: "required"}
			}
			continue
		}

		// Explicit nulls are allowed only when the field is
		// optional. Null on a required field fails the same check
		// as a missing value.
		if raw == nil {
			if f.IsRequired {
				return nil, &ValidationError{Field: f.Slug, Message: "required"}
			}
			out[f.Slug] = nil
			continue
		}

		v, err := coerceValue(raw, f)
		if err != nil {
			return nil, err
		}
		out[f.Slug] = v
	}
	return out, nil
}

// coerceValue turns one JSON-decoded value into the Go type expected
// by pgx for the given field. Failures are reported as
// ValidationError so the caller can surface the bad field back to the
// user. The helper never panics on unexpected input — any shape other
// than what the field type allows becomes an error.
func coerceValue(v any, f *schema.Field) (any, error) {
	switch f.FieldType {

	case schema.FieldText:
		s, ok := v.(string)
		if !ok {
			return nil, typeErr(f.Slug, "string", v)
		}
		return s, nil

	case schema.FieldNumber:
		n, err := asFloat(v)
		if err != nil {
			return nil, &ValidationError{Field: f.Slug, Message: err.Error()}
		}
		return n, nil

	case schema.FieldInteger:
		// JSON numbers arrive as float64 by default. We accept
		// float64 iff it is exactly representable as an int64.
		// Strings are rejected — callers should send numbers.
		switch n := v.(type) {
		case float64:
			if math.Trunc(n) != n || n > math.MaxInt64 || n < math.MinInt64 {
				return nil, &ValidationError{Field: f.Slug, Message: "integer out of range"}
			}
			return int64(n), nil
		case int:
			return int64(n), nil
		case int64:
			return n, nil
		default:
			return nil, typeErr(f.Slug, "integer", v)
		}

	case schema.FieldBoolean:
		b, ok := v.(bool)
		if !ok {
			return nil, typeErr(f.Slug, "bool", v)
		}
		return b, nil

	case schema.FieldDate, schema.FieldDatetime:
		// Date/datetime come in as strings. We parse with
		// RFC3339 for datetime (most client libraries use it)
		// and a plain YYYY-MM-DD for date. The resulting
		// time.Time is what pgx wants for TIMESTAMPTZ / DATE.
		s, ok := v.(string)
		if !ok {
			return nil, typeErr(f.Slug, "date string", v)
		}
		if f.FieldType == schema.FieldDate {
			t, err := time.Parse("2006-01-02", s)
			if err != nil {
				return nil, &ValidationError{Field: f.Slug, Message: "expected YYYY-MM-DD"}
			}
			return t, nil
		}
		t, err := time.Parse(time.RFC3339, s)
		if err != nil {
			return nil, &ValidationError{Field: f.Slug, Message: "expected RFC3339 datetime"}
		}
		return t, nil

	case schema.FieldSelect:
		s, ok := v.(string)
		if !ok {
			return nil, typeErr(f.Slug, "string", v)
		}
		if err := checkSelectChoice(f, s); err != nil {
			return nil, err
		}
		return s, nil

	case schema.FieldMultiselect:
		arr, ok := v.([]any)
		if !ok {
			return nil, typeErr(f.Slug, "string array", v)
		}
		// Materialize as []string so pgx binds it as TEXT[].
		// Every element is validated against the option
		// whitelist (empty choices means "anything goes", matching
		// the review doc's documented gap G1).
		strs := make([]string, 0, len(arr))
		for i, el := range arr {
			s, ok := el.(string)
			if !ok {
				return nil, &ValidationError{
					Field:   f.Slug,
					Message: fmt.Sprintf("element %d is not a string", i),
				}
			}
			if err := checkSelectChoice(f, s); err != nil {
				return nil, err
			}
			strs = append(strs, s)
		}
		return strs, nil

	case schema.FieldRelation, schema.FieldFile:
		// Both store UUIDs. We parse through pgutil.ParseUUID
		// so the resulting pgtype.UUID is what pgx expects; the
		// empty-string case yields a NULL pgtype.UUID which pgx
		// will insert as SQL NULL.
		s, ok := v.(string)
		if !ok {
			return nil, typeErr(f.Slug, "UUID string", v)
		}
		u := pgutil.ParseUUID(s)
		if !u.Valid {
			return nil, &ValidationError{Field: f.Slug, Message: "invalid UUID"}
		}
		return u, nil

	case schema.FieldJSON:
		// Re-encode the already-decoded value so pgx receives
		// a JSON byte slice suitable for JSONB. We do not try
		// to validate structure — the column type is intentionally
		// schemaless.
		b, err := json.Marshal(v)
		if err != nil {
			return nil, &ValidationError{Field: f.Slug, Message: "unencodable value"}
		}
		return b, nil
	}

	return nil, &ValidationError{Field: f.Slug, Message: "unsupported field type"}
}

// checkSelectChoice validates a single candidate string against the
// field's choices list. If the field has no "choices" key (or an
// empty one) we allow anything — matching the documented gap G1 in
// docs/09-SCHEMA-ENGINE-REVIEW.md.
func checkSelectChoice(f *schema.Field, candidate string) error {
	if len(f.Options) == 0 {
		return nil
	}
	var opts struct {
		Choices []string `json:"choices"`
	}
	if err := json.Unmarshal(f.Options, &opts); err != nil {
		// Malformed options JSON is treated as no constraint.
		// The schema validator will eventually reject it; we
		// don't want CRUD to crash on pre-existing bad rows.
		return nil
	}
	if len(opts.Choices) == 0 {
		return nil
	}
	for _, c := range opts.Choices {
		if c == candidate {
			return nil
		}
	}
	return &ValidationError{
		Field:   f.Slug,
		Message: fmt.Sprintf("not in choices %v", opts.Choices),
	}
}

// asFloat accepts the numeric types that json.Unmarshal into any can
// produce, plus the common Go integer types for code-level callers.
func asFloat(v any) (float64, error) {
	switch n := v.(type) {
	case float64:
		return n, nil
	case float32:
		return float64(n), nil
	case int:
		return float64(n), nil
	case int32:
		return float64(n), nil
	case int64:
		return float64(n), nil
	}
	return 0, fmt.Errorf("expected number, got %T", v)
}

func typeErr(field, want string, got any) error {
	return &ValidationError{
		Field:   field,
		Message: fmt.Sprintf("expected %s, got %T", want, got),
	}
}
