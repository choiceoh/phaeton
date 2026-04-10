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
	Description string            `json:"description"`
	Answers     map[string]string `json:"answers,omitempty"` // question_id → answer (second round)
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

// aiBuildQuestion is a clarifying question the AI wants to ask.
type aiBuildQuestion struct {
	ID          string   `json:"id"`
	Question    string   `json:"question"`
	Placeholder string   `json:"placeholder,omitempty"`
	Choices     []string `json:"choices,omitempty"` // optional: predefined choices
}

// aiBuildEnvelope wraps both question and schema responses.
// If Questions is non-empty the frontend should show them; otherwise Schema is the result.
type aiBuildEnvelope struct {
	Mode      string            `json:"mode"` // "questions" | "schema"
	Questions []aiBuildQuestion `json:"questions,omitempty"`
	Schema    *aiBuildSchema    `json:"schema,omitempty"`
}

type aiBuildSchema struct {
	Slug        string         `json:"slug"`
	Label       string         `json:"label"`
	Description string         `json:"description"`
	Icon        string         `json:"icon,omitempty"`
	Fields      []aiBuildField `json:"fields"`
}

// legacy flat response used internally for AI JSON parsing
type aiBuildResponse = aiBuildSchema

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


const triagePrompt = `You are a requirements analyst for Phaeton, a no-code business app platform.
The user wants to create a new app. Your job is to decide whether their description is clear enough to generate a good schema, or if you need to ask clarifying questions first.

## Decision Criteria — Ask questions ONLY when:
- The business process is ambiguous (could mean very different schemas)
- Critical domain information is missing that would change the field design significantly
- The scope is unclear (e.g. "관리" alone without specifying what)

## DO NOT ask questions when:
- The description is short but clear (e.g. "출장 신청서" → obvious what fields are needed)
- Minor details are missing that you can reasonably assume
- You can infer the domain from context

## Output Format
Output ONLY valid JSON — no markdown, no explanation.

If the description is clear enough:
{"mode": "proceed"}

If you need clarification (max 2-3 questions):
{
  "mode": "questions",
  "questions": [
    {
      "id": "q1",
      "question": "Korean question text",
      "placeholder": "예: 답변 힌트",
      "choices": ["선택1", "선택2"]
    }
  ]
}

Rules for questions:
- Max 3 questions. Be concise.
- Questions must be in Korean.
- Include "choices" array when there are obvious options (helps the user answer quickly).
- Include "placeholder" as a hint for free-text answers.
- Each question should have a unique "id" (q1, q2, q3).
- Only ask questions that would significantly change the resulting schema.`


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
// Flow: triage (questions?) → generate → text self-critique.
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

	ctx := r.Context()

	// ── Step 0: Triage — ask clarifying questions if needed ──
	// Skip triage if user already provided answers (second round).
	if len(req.Answers) == 0 {
		slog.Info("ai build: step 0 - triage")

		raw, err := h.client.Complete(ctx, triagePrompt, req.Description)
		if err != nil {
			slog.Warn("ai triage failed, proceeding to generation", "error", err)
		} else if questions, ok := parseTriageResponse(raw); ok && len(questions) > 0 {
			writeJSON(w, http.StatusOK, aiBuildEnvelope{
				Mode:      "questions",
				Questions: questions,
			})
			return
		}
	}

	// Build the full description including answers if present.
	fullDescription := req.Description
	if len(req.Answers) > 0 {
		var sb strings.Builder
		sb.WriteString(req.Description)
		sb.WriteString("\n\n추가 정보:\n")
		for qID, answer := range req.Answers {
			sb.WriteString(fmt.Sprintf("- %s: %s\n", qID, answer))
		}
		fullDescription = sb.String()
	}

	// ── Step 1: Generate schema ──
	slog.Info("ai build: step 1 - generating schema")
	raw, err := h.client.Complete(ctx, systemPromptBase, fullDescription)
	if err != nil {
		slog.Error("ai build step 1 failed", "error", err)
		writeError(w, http.StatusBadGateway, "AI 서버 요청에 실패했습니다")
		return
	}

	result, err := parseAndSanitize(raw)
	if err != nil {
		slog.Error("ai step 1 returned invalid JSON", "raw", raw, "error", err)
		writeError(w, http.StatusBadGateway, "AI 응답을 파싱할 수 없습니다")
		return
	}

	writeJSON(w, http.StatusOK, aiBuildEnvelope{Mode: "schema", Schema: &result})
}

// triageResult is the shape returned by the triage prompt.
type triageResult struct {
	Mode      string            `json:"mode"`
	Questions []aiBuildQuestion `json:"questions,omitempty"`
}

// parseTriageResponse attempts to parse a triage JSON response.
// Returns questions and true if the AI wants to ask, or nil and false to proceed.
func parseTriageResponse(raw string) ([]aiBuildQuestion, bool) {
	jsonStr := extractJSON(raw)
	var tr triageResult
	if err := json.Unmarshal([]byte(jsonStr), &tr); err != nil {
		return nil, false
	}
	if tr.Mode == "questions" && len(tr.Questions) > 0 {
		return tr.Questions, true
	}
	return nil, false
}

// parseAndSanitize extracts JSON from AI output, parses it, and sanitizes slugs.
func parseAndSanitize(raw string) (aiBuildResponse, error) {
	jsonStr := extractJSON(raw)
	var result aiBuildResponse
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return aiBuildResponse{}, err
	}
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
	return result, nil
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

