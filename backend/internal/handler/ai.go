package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/choiceoh/phaeton/backend/internal/ai"
)

// AIHandler serves AI-powered endpoints.
type AIHandler struct {
	client *ai.Client
}

func NewAIHandler(client *ai.Client) *AIHandler {
	return &AIHandler{client: client}
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

const systemPrompt = `You are a schema designer for a no-code business app platform called Phaeton.
The user will describe a business process or data they want to manage. You must generate a collection (app) schema as JSON.

Rules:
1. Output ONLY valid JSON — no markdown fences, no explanation, no extra text.
2. The JSON must have this structure:
{
  "slug": "snake_case_english",
  "label": "Korean display name",
  "description": "Korean description of the collection",
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
3. Valid field types: text, textarea, number, integer, boolean, date, datetime, time, select, multiselect, user, file.
4. For select/multiselect fields, include "options": {"choices": ["선택1", "선택2", ...]}.
5. For number fields that represent currency, include "options": {"display_type": "currency", "currency_code": "KRW"}.
6. For text fields that are URLs, include "options": {"display_type": "url"}.
7. For text fields that are emails, include "options": {"display_type": "email"}.
8. For text fields that are phone numbers, include "options": {"display_type": "phone"}.
9. slug must start with a lowercase letter, only contain [a-z0-9_], and be at most 63 chars.
10. Do NOT use these reserved slugs: id, created_at, updated_at, created_by, updated_by, deleted_at, _status.
11. width can be 1 (1/6), 2 (1/3), 3 (1/2), or 6 (full width). Default is 6.
12. height can be 1, 2, or 3 rows. Default is 1. Use 2-3 for textarea.
13. Design 5-15 fields that are practical and cover the key data points for the described business process.
14. All labels and descriptions must be in Korean.
15. Think about what fields would actually be useful in a Korean business context.`

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

	raw, err := h.client.Complete(r.Context(), systemPrompt, req.Description)
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

