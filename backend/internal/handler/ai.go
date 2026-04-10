package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/choiceoh/phaeton/backend/internal/ai"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// AIHandler serves AI-powered endpoints.
type AIHandler struct {
	client *ai.Client
	store  *schema.Store
}

func NewAIHandler(client *ai.Client, store *schema.Store) *AIHandler {
	return &AIHandler{client: client, store: store}
}

type aiBuildRequest struct {
	Description string `json:"description"`
}

type aiBuildField struct {
	Slug       string                 `json:"slug"`
	Label      string                 `json:"label"`
	FieldType  string                 `json:"field_type"`
	IsRequired bool                   `json:"is_required"`
	Width      int                    `json:"width"`
	Height     int                    `json:"height"`
	Options    map[string]interface{} `json:"options,omitempty"`
}

type aiBuildResponse struct {
	Slug        string         `json:"slug"`
	Label       string         `json:"label"`
	Description string         `json:"description"`
	Icon        string         `json:"icon,omitempty"`
	Fields      []aiBuildField `json:"fields"`
}

const systemPromptBase = `You are a schema designer for Phaeton, a no-code business app platform used by a Korean company.
The user will describe a business process or data they want to manage. You must generate a collection (app) schema as JSON.

## Output Format
Output ONLY valid JSON — no markdown fences, no explanation, no extra text.
{
  "slug": "snake_case_english",
  "label": "Korean display name",
  "description": "Korean description (1-2 sentences explaining purpose)",
  "fields": [
    {
      "slug": "snake_case_english",
      "label": "Korean field name",
      "field_type": "one of the valid types",
      "is_required": true/false,
      "width": 6,
      "height": 1,
      "options": {}
    }
  ]
}

## Field Types & Options
Valid field types: text, textarea, number, integer, boolean, date, datetime, time, select, multiselect, user, file, autonumber, relation, json.

Layout types (visual only, no data): label, line, spacer.

Option rules:
- select/multiselect → "options": {"choices": ["선택1", "선택2", ...]}. Provide realistic Korean business choices (e.g. status: ["대기", "진행중", "완료", "보류"]).
- number (currency) → "options": {"display_type": "currency", "currency_code": "KRW"}
- text (URL) → "options": {"display_type": "url"}
- text (email) → "options": {"display_type": "email"}
- text (phone) → "options": {"display_type": "phone"}
- autonumber → "options": {"prefix": "XXX-", "start": 1} (auto-incrementing ID)
- label → "options": {"text": "섹션 제목 텍스트"} (section header)

## Slug Rules
- Start with lowercase letter, only [a-z0-9_], max 63 chars.
- Reserved (do NOT use): id, created_at, updated_at, created_by, updated_by, deleted_at, _status.

## Layout Rules
- width: 1 (1/6), 2 (1/3), 3 (1/2), 6 (full width). Default 6.
- height: 1, 2, or 3 rows. Default 1. Use 2-3 for textarea.
- Group related fields on the same row using width (e.g. two width=3 fields side by side).
- Use "label" type fields as section headers to organize long forms.
- Use "line" type for visual separation between sections.

## Design Guidelines
- Design 5-15 fields that are practical and cover the key data points.
- All labels and descriptions must be in Korean.
- Think about what fields would actually be useful in a Korean business context.
- Include a status field (select type) when the business process has workflow states.
- Include a user field for "담당자" (assignee) when tasks/items need ownership.
- Include date fields for deadlines or milestones when relevant.
- For forms that will have many fields, use label/line layout types to create logical sections.
- Prefer specific field types over generic text (e.g. use date instead of text for dates, number for amounts).
- Make critical identification fields required (is_required: true), but don't over-require.`

// buildSystemPrompt constructs the full system prompt including existing app context.
func (h *AIHandler) buildSystemPrompt(r *http.Request) string {
	collections, err := h.store.ListCollections(r.Context())
	if err != nil {
		slog.Warn("ai: failed to list collections for context", "error", err)
		return systemPromptBase
	}
	if len(collections) == 0 {
		return systemPromptBase
	}

	var sb strings.Builder
	sb.WriteString(systemPromptBase)
	sb.WriteString("\n\n## Existing Apps in This Workspace\n")
	sb.WriteString("Below are the apps already created in this workspace. Use them as reference to:\n")
	sb.WriteString("- Match naming conventions and style used by this team.\n")
	sb.WriteString("- Avoid creating duplicate apps.\n")
	sb.WriteString("- Suggest relation fields when the new app logically connects to existing ones.\n")
	sb.WriteString("- Understand the domain/industry context of this workspace.\n\n")

	for _, col := range collections {
		fields, err := h.store.ListFields(r.Context(), col.ID)
		if err != nil {
			slog.Warn("ai: failed to list fields", "collection", col.Slug, "error", err)
			continue
		}

		sb.WriteString(fmt.Sprintf("### %s (%s)\n", col.Label, col.Slug))
		if col.Description != "" {
			sb.WriteString(fmt.Sprintf("설명: %s\n", col.Description))
		}
		sb.WriteString("필드:\n")
		for _, f := range fields {
			opts := ""
			if len(f.Options) > 0 && string(f.Options) != "null" {
				opts = fmt.Sprintf(" options=%s", string(f.Options))
			}
			req := ""
			if f.IsRequired {
				req = " [필수]"
			}
			sb.WriteString(fmt.Sprintf("- %s (%s, %s)%s%s\n", f.Label, f.Slug, f.FieldType, req, opts))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

const slugPrompt = `You are a slug generator for a no-code business app platform.
The user will provide a Korean name (label) for a collection or field.
You must generate an English snake_case slug that represents the meaning.

Rules:
1. Output ONLY the slug string — no quotes, no explanation, no extra text.
2. The slug must start with a lowercase letter, only contain [a-z0-9_], and be at most 63 chars.
3. Do NOT use these reserved slugs: id, created_at, updated_at, created_by, updated_by, deleted_at, _status.
4. Translate the Korean meaning to concise English, then convert to snake_case.
5. Examples:
   - "인허가 체크리스트" → "permit_checklist"
   - "프로젝트 관리" → "project_management"
   - "출장 신청서" → "business_trip_request"
   - "재고 현황" → "inventory_status"
   - "거래처 목록" → "vendor_list"`

type aiSlugRequest struct {
	Label string `json:"label"`
}

type aiSlugResponse struct {
	Slug string `json:"slug"`
}

// GenerateSlug generates an English snake_case slug from a Korean label.
func (h *AIHandler) GenerateSlug(w http.ResponseWriter, r *http.Request) {
	var req aiSlugRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(req.Label) == "" {
		writeError(w, http.StatusBadRequest, "label is required")
		return
	}

	raw, err := h.client.Complete(r.Context(), slugPrompt, req.Label)
	if err != nil {
		slog.Error("ai generate-slug failed", "error", err)
		writeError(w, http.StatusBadGateway, "AI 서버 요청에 실패했습니다")
		return
	}

	slug := sanitizeSlug(strings.TrimSpace(raw))
	writeJSON(w, http.StatusOK, aiSlugResponse{Slug: slug})
}

// BuildCollection generates a collection schema from a natural-language description.
func (h *AIHandler) BuildCollection(w http.ResponseWriter, r *http.Request) {
	var req aiBuildRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(req.Description) == "" {
		writeError(w, http.StatusBadRequest, "description is required")
		return
	}

	prompt := h.buildSystemPrompt(r)
	raw, err := h.client.Complete(r.Context(), prompt, req.Description)
	if err != nil {
		slog.Error("ai build-collection failed", "error", err)
		writeError(w, http.StatusBadGateway, "AI 서버 요청에 실패했습니다")
		return
	}

	// Extract JSON from the response (handle potential markdown fences).
	jsonStr := extractJSON(raw)

	var result aiBuildResponse
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		slog.Error("ai returned invalid JSON", "raw", raw, "error", err)
		writeError(w, http.StatusBadGateway, "AI 응답을 파싱할 수 없습니다")
		return
	}

	// Sanitize: ensure slug is valid.
	result.Slug = sanitizeSlug(result.Slug)
	for i := range result.Fields {
		result.Fields[i].Slug = sanitizeSlug(result.Fields[i].Slug)
		if result.Fields[i].Width == 0 {
			result.Fields[i].Width = 6
		}
		if result.Fields[i].Height == 0 {
			result.Fields[i].Height = 1
		}
	}

	writeJSON(w, http.StatusOK, result)
}

var slugRe = regexp.MustCompile(`[^a-z0-9_]`)

func sanitizeSlug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugRe.ReplaceAllString(s, "_")
	// Ensure starts with letter.
	if len(s) > 0 && (s[0] < 'a' || s[0] > 'z') {
		s = "x_" + s
	}
	if len(s) > 63 {
		s = s[:63]
	}
	return s
}

// extractJSON tries to pull a JSON object from AI output that might be wrapped
// in markdown code fences or have extra text around it.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)

	// Strip markdown fences.
	if idx := strings.Index(s, "```json"); idx >= 0 {
		s = s[idx+7:]
	} else if idx := strings.Index(s, "```"); idx >= 0 {
		s = s[idx+3:]
	}
	if idx := strings.LastIndex(s, "```"); idx >= 0 {
		s = s[:idx]
	}

	s = strings.TrimSpace(s)

	// Find the outermost { ... }.
	start := strings.Index(s, "{")
	if start < 0 {
		return s
	}
	depth := 0
	end := -1
	for i := start; i < len(s); i++ {
		switch s[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				end = i
				goto done
			}
		}
	}
done:
	if end > start {
		return s[start : end+1]
	}
	return s[start:]
}

