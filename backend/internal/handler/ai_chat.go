package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/choiceoh/phaeton/backend/internal/ai"
)

type aiChatRequest struct {
	Message string           `json:"message"`
	History []ai.ChatMessage `json:"history,omitempty"`
}

type aiChatResponse struct {
	Reply string `json:"reply"`
}

const chatSystemPromptBase = `You are a helpful assistant for Phaeton, a no-code business app platform used by a Korean company.
Your role is to answer user questions about the platform and help them use it effectively.

` + chatGuide + `

## Response Guidelines
- Always respond in Korean.
- Be concise and practical. Answer in 2-5 sentences for simple questions.
- If the user asks about a specific app, refer to the existing apps listed below.
- If asked how to do something, give numbered step-by-step instructions.
- If asked about a feature that doesn't exist, say so honestly and suggest alternatives.
- Do NOT generate JSON schemas in chat — direct users to "AI로 만들기" for that.
- Use plain text formatting. Bold important terms with ** for emphasis.
- When referring to UI elements, use the Korean labels as they appear in the app.

## 데이터 조회 기능
사용자가 특정 앱의 데이터를 조회하거나 요약을 요청하면, 아래 태그를 사용하여 데이터를 요청할 수 있습니다.

### 사용법
[DATA_QUERY:앱_slug] — 해당 앱의 최근 데이터 5건 조회
[DATA_QUERY:앱_slug:10] — 최근 데이터 10건 조회 (최대 20건)
[DATA_QUERY:앱_slug:5:필드slug=eq:값] — 필터 조건으로 데이터 조회

### 필터 연산자
eq(같음), neq(같지않음), gt(초과), gte(이상), lt(미만), lte(이하), like(포함), in(여러값), is_null(비어있음)

### 규칙
- 반드시 앱 slug를 사용하세요 (한국어 이름 X).
- 태그는 응답 내용 앞에 별도 줄로 작성하세요.
- 데이터를 확인한 후 사용자에게 자연스럽게 요약하여 답변하세요.
- 한 번에 최대 3개 앱까지 조회할 수 있습니다.
- 데이터 조회 태그만 출력하고 다른 텍스트는 작성하지 마세요 (시스템이 데이터를 주입한 후 다시 호출합니다).`

// queryTag matches [DATA_QUERY:slug], [DATA_QUERY:slug:limit], [DATA_QUERY:slug:limit:filters].
var queryTagRe = regexp.MustCompile(`\[DATA_QUERY:([a-z0-9_]+)(?::(\d+))?(?::([^\]]+))?\]`)

// buildChatSystemPrompt adds existing workspace apps (with record counts and views) to the chat system prompt.
func (h *AIHandler) buildChatSystemPrompt(ctx context.Context) string {
	if h.store == nil {
		return chatSystemPromptBase
	}
	collections, err := h.store.ListCollections(ctx)
	if err != nil {
		slog.Warn("ai chat: failed to list collections", "error", err)
		return chatSystemPromptBase
	}
	if len(collections) == 0 {
		return chatSystemPromptBase
	}

	var sb strings.Builder
	sb.WriteString(chatSystemPromptBase)
	sb.WriteString("\n\n## 현재 워크스페이스의 앱 목록\n")

	for _, col := range collections {
		fields, err := h.store.ListFields(ctx, col.ID)
		if err != nil {
			continue
		}

		// Record count.
		var count int64
		countSQL := fmt.Sprintf(`SELECT COUNT(*) FROM "data".%q WHERE deleted_at IS NULL`, col.Slug)
		if err := h.pool.QueryRow(ctx, countSQL).Scan(&count); err != nil {
			slog.Warn("ai chat: count failed", "slug", col.Slug, "error", err)
		}

		sb.WriteString(fmt.Sprintf("\n### %s (slug: %s) — 레코드 %d건\n", col.Label, col.Slug, count))
		if col.Description != "" {
			sb.WriteString(fmt.Sprintf("설명: %s\n", col.Description))
		}

		// Fields.
		if len(fields) > 0 {
			sb.WriteString("필드: ")
			names := make([]string, 0, len(fields))
			for _, f := range fields {
				if f.IsLayout {
					continue
				}
				names = append(names, fmt.Sprintf("%s(%s, %s)", f.Label, f.Slug, f.FieldType))
			}
			sb.WriteString(strings.Join(names, ", "))
			sb.WriteString("\n")
		}

		// Views.
		views, err := h.store.ListViews(ctx, col.ID)
		if err == nil && len(views) > 0 {
			vnames := make([]string, 0, len(views))
			for _, v := range views {
				vnames = append(vnames, fmt.Sprintf("%s(%s)", v.Name, v.ViewType))
			}
			sb.WriteString("뷰: " + strings.Join(vnames, ", ") + "\n")
		}

		// Process status.
		if proc, ok := h.cache.ProcessByCollectionID(col.ID); ok && len(proc.Statuses) > 0 {
			snames := make([]string, 0, len(proc.Statuses))
			for _, s := range proc.Statuses {
				snames = append(snames, s.Name)
			}
			sb.WriteString("프로세스 상태: " + strings.Join(snames, " → ") + "\n")
		}
	}

	return sb.String()
}

// queryAppData fetches recent entries from a dynamic table for AI context.
func (h *AIHandler) queryAppData(ctx context.Context, slug string, limit int, filterExpr string) (string, error) {
	col, ok := h.cache.CollectionBySlug(slug)
	if !ok {
		return "", fmt.Errorf("앱 '%s'을(를) 찾을 수 없습니다", slug)
	}

	if limit <= 0 {
		limit = 5
	}
	if limit > 20 {
		limit = 20
	}

	fields := h.cache.Fields(col.ID)

	// Build SELECT columns (only data fields, skip layout).
	selectCols := []string{"id", "_created_at", "_updated_at", "_created_by"}
	for _, f := range fields {
		if f.IsLayout {
			continue
		}
		selectCols = append(selectCols, fmt.Sprintf("%q", f.Slug))
	}

	qTable := fmt.Sprintf(`"data".%q`, col.Slug)
	where := "deleted_at IS NULL"
	var args []any

	// Parse simple filters from filterExpr (e.g. "status=eq:active,priority=gt:3").
	if filterExpr != "" {
		parts := strings.Split(filterExpr, ",")
		for _, part := range parts {
			eqIdx := strings.Index(part, "=")
			if eqIdx < 0 {
				continue
			}
			fieldSlug := part[:eqIdx]
			opVal := part[eqIdx+1:]
			colonIdx := strings.Index(opVal, ":")
			if colonIdx < 0 {
				continue
			}
			op := opVal[:colonIdx]
			val := opVal[colonIdx+1:]

			// Validate field exists.
			validField := false
			for _, f := range fields {
				if f.Slug == fieldSlug {
					validField = true
					break
				}
			}
			if !validField {
				continue
			}

			argIdx := len(args) + 1
			sqlOp := ""
			switch op {
			case "eq":
				sqlOp = "="
			case "neq":
				sqlOp = "!="
			case "gt":
				sqlOp = ">"
			case "gte":
				sqlOp = ">="
			case "lt":
				sqlOp = "<"
			case "lte":
				sqlOp = "<="
			case "like":
				sqlOp = "ILIKE"
				val = "%" + val + "%"
			case "is_null":
				if val == "true" {
					where += fmt.Sprintf(" AND %q IS NULL", fieldSlug)
				} else {
					where += fmt.Sprintf(" AND %q IS NOT NULL", fieldSlug)
				}
				continue
			default:
				continue
			}

			where += fmt.Sprintf(" AND %q %s $%d", fieldSlug, sqlOp, argIdx)
			args = append(args, val)
		}
	}

	query := fmt.Sprintf("SELECT %s FROM %s WHERE %s ORDER BY _created_at DESC LIMIT %d",
		strings.Join(selectCols, ", "), qTable, where, limit)

	rows, err := h.pool.Query(ctx, query, args...)
	if err != nil {
		return "", fmt.Errorf("데이터 조회 실패: %w", err)
	}
	records, err := collectRows(rows)
	rows.Close()
	if err != nil {
		return "", fmt.Errorf("데이터 파싱 실패: %w", err)
	}

	// Count total.
	var total int64
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s", qTable, where)
	if err := h.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		total = int64(len(records))
	}

	// Format results as readable text for AI.
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("## %s (%s) 데이터 조회 결과 — 전체 %d건 중 %d건 표시\n\n",
		col.Label, col.Slug, total, len(records)))

	if len(records) == 0 {
		sb.WriteString("(데이터 없음)\n")
		return sb.String(), nil
	}

	// Build field label map for readable output.
	labelMap := map[string]string{
		"id":          "ID",
		"_created_at": "생성일",
		"_updated_at": "수정일",
		"_created_by": "작성자",
	}
	for _, f := range fields {
		labelMap[f.Slug] = f.Label
	}

	for i, rec := range records {
		sb.WriteString(fmt.Sprintf("### 레코드 %d\n", i+1))
		for _, col := range selectCols {
			label := labelMap[col]
			if label == "" {
				label = col
			}
			val := rec[strings.Trim(col, `"`)]
			if val == nil {
				continue
			}
			// Format value.
			var valStr string
			switch v := val.(type) {
			case map[string]any:
				b, _ := json.Marshal(v)
				valStr = string(b)
			case []any:
				b, _ := json.Marshal(v)
				valStr = string(b)
			default:
				valStr = fmt.Sprintf("%v", v)
			}
			sb.WriteString(fmt.Sprintf("- %s: %s\n", label, valStr))
		}
		sb.WriteString("\n")
	}

	return sb.String(), nil
}

// parseAndExecuteQueries checks if the AI response contains DATA_QUERY tags,
// executes the queries, and returns the data context. Returns empty string if no queries found.
func (h *AIHandler) parseAndExecuteQueries(ctx context.Context, response string) string {
	matches := queryTagRe.FindAllStringSubmatch(response, 3) // max 3 queries
	if len(matches) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("\n\n## 조회된 데이터\n")

	for _, m := range matches {
		slug := m[1]
		limit := 5
		filterExpr := ""

		if m[2] != "" {
			fmt.Sscanf(m[2], "%d", &limit)
		}
		if m[3] != "" {
			filterExpr = m[3]
		}

		result, err := h.queryAppData(ctx, slug, limit, filterExpr)
		if err != nil {
			sb.WriteString(fmt.Sprintf("\n[%s 조회 오류: %s]\n", slug, err.Error()))
			continue
		}
		sb.WriteString("\n" + result)
	}

	return sb.String()
}

// Chat handles conversational Q&A about the platform.
func (h *AIHandler) Chat(w http.ResponseWriter, r *http.Request) {
	var req aiChatRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(req.Message) == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}

	ctx := r.Context()
	systemPrompt := h.buildChatSystemPrompt(ctx)

	// First pass: let AI decide if it needs data.
	reply, err := h.client.CompleteChat(ctx, systemPrompt, req.History, req.Message)
	if err != nil {
		slog.Error("ai chat failed", "error", err)
		writeError(w, http.StatusBadGateway, "AI 서버 요청에 실패했습니다")
		return
	}

	// Check if AI requested data queries.
	dataContext := h.parseAndExecuteQueries(ctx, reply)
	if dataContext != "" {
		// Second pass: re-prompt with data injected.
		augmentedHistory := make([]ai.ChatMessage, len(req.History))
		copy(augmentedHistory, req.History)
		augmentedHistory = append(augmentedHistory,
			ai.ChatMessage{Role: "assistant", Content: reply},
			ai.ChatMessage{Role: "user", Content: "아래는 요청한 데이터 조회 결과입니다. 이 데이터를 바탕으로 사용자의 원래 질문에 자연스럽게 답변해 주세요.\n" + dataContext},
		)

		reply2, err := h.client.CompleteChat(ctx, systemPrompt, augmentedHistory, req.Message)
		if err != nil {
			slog.Warn("ai chat second pass failed, using first pass", "error", err)
			// Strip query tags from first pass response as fallback.
			reply = queryTagRe.ReplaceAllString(reply, "")
			reply = strings.TrimSpace(reply)
		} else {
			reply = reply2
		}
	}

	// Clean any remaining query tags from the response.
	reply = queryTagRe.ReplaceAllString(reply, "")
	reply = strings.TrimSpace(reply)

	writeJSON(w, http.StatusOK, aiChatResponse{Reply: reply})
}
