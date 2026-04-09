// Package seed creates preset collections for Phaeton's domain (energy project management).
// Idempotent: checks for existence before creating.
package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// Preset encodes a collection to create if it does not already exist.
type Preset struct {
	Slug        string
	Label       string
	Description string
	Icon        string
	Fields      []schema.CreateFieldIn
}

// Presets returns the built-in collection presets for Phaeton.
// Ordering matters: "projects" must be created before "milestones" so the relation target exists.
func Presets() []Preset {
	return []Preset{
		projectsPreset(),
		milestonesPreset(),
		staffPreset(),
	}
}

func projectsPreset() Preset {
	return Preset{
		Slug:        "projects",
		Label:       "프로젝트",
		Description: "에너지 프로젝트 관리 — 태양광, 풍력, ESS, 하이브리드",
		Icon:        "chart",
		Fields: []schema.CreateFieldIn{
			{
				Slug:       "name",
				Label:      "프로젝트명",
				FieldType:  schema.FieldText,
				IsRequired: true,
				IsIndexed:  true,
			},
			{
				Slug:       "project_type",
				Label:      "유형",
				FieldType:  schema.FieldSelect,
				IsRequired: true,
				IsIndexed:  true,
				Options: jsonRaw(map[string]any{
					"choices": []string{"solar", "wind", "ess", "hybrid"},
				}),
			},
			{
				Slug:      "capacity_kw",
				Label:     "용량(kW)",
				FieldType: schema.FieldNumber,
			},
			{
				Slug:      "region",
				Label:     "지역",
				FieldType: schema.FieldText,
			},
			{
				Slug:      "status",
				Label:     "상태",
				FieldType: schema.FieldSelect,
				IsIndexed: true,
				Options: jsonRaw(map[string]any{
					"choices": []string{"planning", "permit", "construction", "testing", "cod"},
				}),
			},
			{
				Slug:      "cod_target",
				Label:     "COD 목표일",
				FieldType: schema.FieldDate,
			},
		},
	}
}

func milestonesPreset() Preset {
	return Preset{
		Slug:        "milestones",
		Label:       "마일스톤",
		Description: "프로젝트별 마일스톤 추적",
		Icon:        "check",
		Fields: []schema.CreateFieldIn{
			{
				Slug:       "name",
				Label:      "마일스톤명",
				FieldType:  schema.FieldText,
				IsRequired: true,
			},
			{
				Slug:      "seq_order",
				Label:     "순서",
				FieldType: schema.FieldInteger,
			},
			{
				Slug:      "status",
				Label:     "상태",
				FieldType: schema.FieldSelect,
				IsIndexed: true,
				Options: jsonRaw(map[string]any{
					"choices": []string{"pending", "active", "done", "blocked", "skipped"},
				}),
			},
			{
				Slug:      "due_date",
				Label:     "기한",
				FieldType: schema.FieldDate,
			},
			{
				Slug:      "completed_at",
				Label:     "완료일",
				FieldType: schema.FieldDatetime,
			},
			{
				Slug:      "is_critical",
				Label:     "중요",
				FieldType: schema.FieldBoolean,
			},
			// Relation filled in by applyProjectRef() after the projects collection is created.
		},
	}
}

func staffPreset() Preset {
	return Preset{
		Slug:        "staff",
		Label:       "인력",
		Description: "프로젝트 투입 인력 관리",
		Icon:        "tool",
		Fields: []schema.CreateFieldIn{
			{
				Slug:       "name",
				Label:      "이름",
				FieldType:  schema.FieldText,
				IsRequired: true,
			},
			{
				Slug:      "role",
				Label:     "직무",
				FieldType: schema.FieldText,
			},
			{
				Slug:      "email",
				Label:     "이메일",
				FieldType: schema.FieldText,
			},
			{
				Slug:      "is_active",
				Label:     "활성",
				FieldType: schema.FieldBoolean,
			},
		},
	}
}

// Run creates presets through the migration engine. Skips any collection
// that already exists (matched by slug).
func Run(ctx context.Context, engine *migration.Engine, cache *schema.Cache) error {
	presets := Presets()

	// Track IDs of freshly-created collections so we can wire up relations.
	created := make(map[string]string)

	for _, p := range presets {
		if _, exists := cache.CollectionBySlug(p.Slug); exists {
			slog.Info("seed: collection exists, skipping", "slug", p.Slug)
			continue
		}

		req := &schema.CreateCollectionReq{
			Slug:        p.Slug,
			Label:       p.Label,
			Description: p.Description,
			Icon:        p.Icon,
			Fields:      p.Fields,
		}
		col, err := engine.CreateCollection(ctx, req)
		if err != nil {
			return fmt.Errorf("seed %s: %w", p.Slug, err)
		}
		created[p.Slug] = col.ID
		slog.Info("seed: created collection", "slug", p.Slug, "id", col.ID)
	}

	// After all base collections exist, add the milestones.project relation.
	if err := applyProjectRef(ctx, engine, cache); err != nil {
		return fmt.Errorf("seed: apply project ref: %w", err)
	}

	return nil
}

// applyProjectRef adds a milestones.project relation pointing to projects,
// but only if the relation does not already exist.
func applyProjectRef(ctx context.Context, engine *migration.Engine, cache *schema.Cache) error {
	milestones, ok := cache.CollectionBySlug("milestones")
	if !ok {
		return nil
	}
	projects, ok := cache.CollectionBySlug("projects")
	if !ok {
		return nil
	}

	// Skip if relation field already present.
	for _, f := range cache.Fields(milestones.ID) {
		if f.Slug == "project" {
			return nil
		}
	}

	req := &schema.CreateFieldIn{
		Slug:       "project",
		Label:      "프로젝트",
		FieldType:  schema.FieldRelation,
		IsRequired: true,
		IsIndexed:  true,
		Relation: &schema.CreateRelIn{
			TargetCollectionID: projects.ID,
			RelationType:       schema.RelOneToMany,
			OnDelete:           "CASCADE",
		},
	}

	_, _, err := engine.AddField(ctx, milestones.ID, req, true)
	if err != nil {
		return fmt.Errorf("add milestones.project: %w", err)
	}
	slog.Info("seed: added milestones.project relation")
	return nil
}

func jsonRaw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
