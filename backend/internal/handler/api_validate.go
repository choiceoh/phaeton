package handler

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/pgutil"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// validatePayload checks user-supplied data against field definitions before
// it reaches the database. It catches problems that PG would otherwise raise
// as opaque errors (FK violations, type mismatches, check constraints) and
// returns a structured ErrInvalidInput so handleErr maps it to a 400.
//
// `isCreate` controls whether required fields must be present (only on POST).
func validatePayload(
	ctx context.Context,
	pool *pgxpool.Pool,
	cache *schema.Cache,
	body map[string]any,
	fields []schema.Field,
	isCreate bool,
) error {
	// Index fields for faster lookup.
	bySlug := make(map[string]schema.Field, len(fields))
	for _, f := range fields {
		bySlug[f.Slug] = f
	}

	// Reject unknown user-supplied fields (the API surface should match the schema).
	for k := range body {
		if _, ok := bySlug[k]; ok {
			continue
		}
		// `created_by` is the only system column the client may set.
		if k == "created_by" {
			continue
		}
		return fmt.Errorf("%w: unknown field %q", schema.ErrInvalidInput, k)
	}

	for _, f := range fields {
		v, present := body[f.Slug]

		if !present {
			if isCreate && f.IsRequired {
				return fmt.Errorf("%w: field %q is required", schema.ErrInvalidInput, f.Slug)
			}
			continue
		}
		if v == nil {
			if f.IsRequired {
				return fmt.Errorf("%w: field %q cannot be null", schema.ErrInvalidInput, f.Slug)
			}
			continue
		}

		if err := validateFieldValue(f, v); err != nil {
			return fmt.Errorf("field %q: %w", f.Slug, err)
		}

		// Relation: confirm the target row exists (and isn't soft-deleted).
		if f.FieldType == schema.FieldRelation && f.Relation != nil {
			id, ok := v.(string)
			if !ok {
				return fmt.Errorf("%w: field %q must be a UUID string", schema.ErrInvalidInput, f.Slug)
			}
			if err := checkRelationTarget(ctx, pool, cache, f.Relation.TargetCollectionID, id); err != nil {
				return fmt.Errorf("field %q: %w", f.Slug, err)
			}
		}
	}
	return nil
}

func validateFieldValue(f schema.Field, v any) error {
	switch f.FieldType {
	case schema.FieldText:
		if _, ok := v.(string); !ok {
			return fmt.Errorf("%w: expected string", schema.ErrInvalidInput)
		}
	case schema.FieldNumber:
		if _, ok := v.(float64); !ok {
			return fmt.Errorf("%w: expected number", schema.ErrInvalidInput)
		}
	case schema.FieldInteger:
		f64, ok := v.(float64)
		if !ok {
			return fmt.Errorf("%w: expected integer", schema.ErrInvalidInput)
		}
		if f64 != float64(int64(f64)) {
			return fmt.Errorf("%w: expected whole number, got %v", schema.ErrInvalidInput, f64)
		}
	case schema.FieldBoolean:
		if _, ok := v.(bool); !ok {
			return fmt.Errorf("%w: expected boolean", schema.ErrInvalidInput)
		}
	case schema.FieldDate:
		s, ok := v.(string)
		if !ok {
			return fmt.Errorf("%w: expected date string YYYY-MM-DD", schema.ErrInvalidInput)
		}
		if _, err := time.Parse("2006-01-02", s); err != nil {
			return fmt.Errorf("%w: invalid date %q (expected YYYY-MM-DD)", schema.ErrInvalidInput, s)
		}
	case schema.FieldDatetime:
		s, ok := v.(string)
		if !ok {
			return fmt.Errorf("%w: expected RFC3339 datetime string", schema.ErrInvalidInput)
		}
		if _, err := time.Parse(time.RFC3339, s); err != nil {
			return fmt.Errorf("%w: invalid datetime %q", schema.ErrInvalidInput, s)
		}
	case schema.FieldSelect:
		s, ok := v.(string)
		if !ok {
			return fmt.Errorf("%w: expected string for select", schema.ErrInvalidInput)
		}
		choices, err := schema.ExtractChoices(f.Options)
		if err != nil {
			return fmt.Errorf("%w: malformed options: %v", schema.ErrInvalidInput, err)
		}
		if !contains(choices, s) {
			return fmt.Errorf("%w: %q is not in allowed choices %v", schema.ErrInvalidInput, s, choices)
		}
	case schema.FieldMultiselect:
		arr, ok := v.([]any)
		if !ok {
			return fmt.Errorf("%w: expected array for multiselect", schema.ErrInvalidInput)
		}
		choices, err := schema.ExtractChoices(f.Options)
		if err != nil {
			return fmt.Errorf("%w: malformed options: %v", schema.ErrInvalidInput, err)
		}
		for _, item := range arr {
			s, ok := item.(string)
			if !ok {
				return fmt.Errorf("%w: multiselect items must be strings", schema.ErrInvalidInput)
			}
			if !contains(choices, s) {
				return fmt.Errorf("%w: %q is not in allowed choices %v", schema.ErrInvalidInput, s, choices)
			}
		}
	case schema.FieldRelation, schema.FieldFile:
		s, ok := v.(string)
		if !ok {
			return fmt.Errorf("%w: expected UUID string", schema.ErrInvalidInput)
		}
		if !pgutil.ParseUUID(s).Valid {
			return fmt.Errorf("%w: invalid UUID %q", schema.ErrInvalidInput, s)
		}
	case schema.FieldJSON:
		// Any JSON value is acceptable; we just need to round-trip through encoding.
		_ = v
	default:
		return fmt.Errorf("%w: unhandled field type %q", schema.ErrInvalidInput, f.FieldType)
	}
	return nil
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

// checkRelationTarget confirms the referenced row exists and is not soft-deleted.
func checkRelationTarget(ctx context.Context, pool *pgxpool.Pool, cache *schema.Cache, targetCollectionID, id string) error {
	target, ok := cache.CollectionByID(targetCollectionID)
	if !ok {
		return fmt.Errorf("%w: relation target collection %s not found", schema.ErrInvalidInput, targetCollectionID)
	}
	qTable := fmt.Sprintf("%q.%q", "data", target.Slug)
	var exists bool
	err := pool.QueryRow(ctx,
		"SELECT EXISTS (SELECT 1 FROM "+qTable+" WHERE id = $1 AND deleted_at IS NULL)",
		id,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("verify relation target: %w", err)
	}
	if !exists {
		return fmt.Errorf("%w: relation target %s does not exist in %s", schema.ErrInvalidInput, id, target.Slug)
	}
	return nil
}
