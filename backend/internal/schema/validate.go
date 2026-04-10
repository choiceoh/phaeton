package schema

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var (
	errInvalidUUID  = errors.New("invalid UUID format")
	ErrNotFound     = errors.New("not found")
	ErrConflict     = errors.New("already exists")
	ErrInvalidInput = errors.New("invalid input")
)

// slugRe: lowercase letters, digits, underscore. Must start with a letter.
var slugRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`)

// PostgreSQL reserved words that cannot be used as table/column names.
var pgReserved = map[string]bool{
	"all": true, "analyse": true, "analyze": true, "and": true, "any": true,
	"array": true, "as": true, "asc": true, "asymmetric": true, "authorization": true,
	"between": true, "binary": true, "both": true, "case": true, "cast": true,
	"check": true, "collate": true, "column": true, "constraint": true, "create": true,
	"cross": true, "current_date": true, "current_role": true, "current_time": true,
	"current_timestamp": true, "current_user": true, "default": true, "deferrable": true,
	"desc": true, "distinct": true, "do": true, "else": true, "end": true, "except": true,
	"false": true, "fetch": true, "for": true, "foreign": true, "freeze": true,
	"from": true, "full": true, "grant": true, "group": true, "having": true, "ilike": true,
	"in": true, "index": true, "initially": true, "inner": true, "intersect": true,
	"into": true, "is": true, "isnull": true, "join": true, "lateral": true, "leading": true,
	"left": true, "like": true, "limit": true, "localtime": true, "localtimestamp": true,
	"natural": true, "not": true, "notnull": true, "null": true, "offset": true, "on": true,
	"only": true, "or": true, "order": true, "outer": true, "overlaps": true, "placing": true,
	"primary": true, "references": true, "returning": true, "right": true, "select": true,
	"session_user": true, "similar": true, "some": true, "symmetric": true, "table": true,
	"then": true, "to": true, "trailing": true, "true": true, "union": true, "unique": true,
	"user": true, "using": true, "variadic": true, "verbose": true, "when": true,
	"where": true, "window": true, "with": true,
}

// autoColumns are injected by the engine into every data table.
var autoColumns = map[string]bool{
	"id": true, "created_at": true, "updated_at": true,
	"created_by": true, "deleted_at": true,
}

func ValidateSlug(slug string) error {
	if !slugRe.MatchString(slug) {
		return fmt.Errorf("%w: slug must match [a-z][a-z0-9_]{0,62}", ErrInvalidInput)
	}
	if pgReserved[slug] {
		return fmt.Errorf("%w: %q is a PostgreSQL reserved word", ErrInvalidInput, slug)
	}
	if autoColumns[slug] {
		return fmt.Errorf("%w: %q is a reserved auto-column name", ErrInvalidInput, slug)
	}
	return nil
}

func ValidateFieldType(ft FieldType) error {
	if !ft.Valid() {
		return fmt.Errorf("%w: unknown field_type %q", ErrInvalidInput, ft)
	}
	return nil
}

func ValidateCollectionCreate(req *CreateCollectionReq) error {
	if err := ValidateSlug(req.Slug); err != nil {
		return err
	}
	if strings.TrimSpace(req.Label) == "" {
		return fmt.Errorf("%w: label is required", ErrInvalidInput)
	}
	slugs := make(map[string]bool, len(req.Fields))
	for i := range req.Fields {
		if err := validateFieldIn(&req.Fields[i]); err != nil {
			return fmt.Errorf("fields[%d]: %w", i, err)
		}
		if slugs[req.Fields[i].Slug] {
			return fmt.Errorf("%w: duplicate field slug %q", ErrInvalidInput, req.Fields[i].Slug)
		}
		slugs[req.Fields[i].Slug] = true
	}
	return nil
}

func ValidateFieldCreate(req *CreateFieldIn) error {
	return validateFieldIn(req)
}

// validWidths and validHeights define the allowed layout grid values.
var validWidths = map[int16]bool{1: true, 2: true, 3: true, 6: true}
var validHeights = map[int16]bool{1: true, 2: true, 3: true}

func validateFieldIn(f *CreateFieldIn) error {
	if err := ValidateSlug(f.Slug); err != nil {
		return err
	}
	if strings.TrimSpace(f.Label) == "" {
		return fmt.Errorf("%w: label is required", ErrInvalidInput)
	}
	if err := ValidateFieldType(f.FieldType); err != nil {
		return err
	}
	if f.Width != 0 && !validWidths[f.Width] {
		return fmt.Errorf("%w: width must be 1, 2, 3, or 6", ErrInvalidInput)
	}
	if f.Height != 0 && !validHeights[f.Height] {
		return fmt.Errorf("%w: height must be 1, 2, or 3", ErrInvalidInput)
	}
	if f.FieldType == FieldRelation && f.Relation == nil {
		return fmt.Errorf("%w: relation field requires relation config", ErrInvalidInput)
	}
	if f.FieldType == FieldSelect || f.FieldType == FieldMultiselect {
		if err := validateSelectOptions(f.Options); err != nil {
			return fmt.Errorf("field %q: %w", f.Slug, err)
		}
	}
	if f.Relation != nil {
		if f.Relation.TargetCollectionID == "" {
			return fmt.Errorf("%w: relation.target_collection_id is required", ErrInvalidInput)
		}
		switch f.Relation.RelationType {
		case RelOneToOne, RelOneToMany, RelManyToMany:
		default:
			return fmt.Errorf("%w: invalid relation_type %q", ErrInvalidInput, f.Relation.RelationType)
		}
		if f.Relation.OnDelete != "" {
			switch strings.ToUpper(strings.TrimSpace(f.Relation.OnDelete)) {
			case "CASCADE", "SET NULL", "RESTRICT", "NO ACTION", "SET DEFAULT":
			default:
				return fmt.Errorf("%w: invalid on_delete %q", ErrInvalidInput, f.Relation.OnDelete)
			}
		}
	}
	return nil
}

// SelectOptions is the expected shape of `options` for select/multiselect fields.
type SelectOptions struct {
	Choices []string `json:"choices"`
}

// ExtractChoices returns the allowed choices from a raw JSON options payload,
// or nil if none are set. Used by both validation and the Dynamic API.
func ExtractChoices(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var opts SelectOptions
	if err := json.Unmarshal(raw, &opts); err != nil {
		return nil, fmt.Errorf("options must be a JSON object with 'choices' array: %w", err)
	}
	return opts.Choices, nil
}

func validateSelectOptions(raw json.RawMessage) error {
	choices, err := ExtractChoices(raw)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}
	if len(choices) == 0 {
		return fmt.Errorf("%w: select field requires options.choices with at least one value", ErrInvalidInput)
	}
	seen := make(map[string]bool, len(choices))
	for _, c := range choices {
		if strings.TrimSpace(c) == "" {
			return fmt.Errorf("%w: choice cannot be empty", ErrInvalidInput)
		}
		if seen[c] {
			return fmt.Errorf("%w: duplicate choice %q", ErrInvalidInput, c)
		}
		seen[c] = true
	}
	return nil
}
