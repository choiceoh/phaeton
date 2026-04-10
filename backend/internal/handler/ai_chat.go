package handler

import (
	"log/slog"
	"net/http"
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

const chatSystemPrompt = `You are a helpful assistant for Phaeton, a no-code business app platform used by a Korean company.
Your role is to answer user questions about the platform and help them use it effectively.

` + chatGuide + `

## Tools
You have tools to look up workspace data. Use them when the user asks about specific apps or fields:
- list_collections: 워크스페이스의 앱 목록 조회
- get_collection_fields: 특정 앱의 필드 상세 조회 (slug 필요 → list_collections 먼저 호출)

Do NOT guess app names or fields — always use the tools to look up real data.

## Response Guidelines
- Always respond in Korean.
- Be concise and practical. Answer in 2-5 sentences for simple questions.
- If asked how to do something, give numbered step-by-step instructions.
- If asked about a feature that doesn't exist, say so honestly and suggest alternatives.
- Do NOT generate JSON schemas in chat — direct users to "AI로 만들기" for that.
- Use plain text formatting. Bold important terms with ** for emphasis.
- When referring to UI elements, use the Korean labels as they appear in the app.`

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

	resolve := h.newToolResolver(r.Context())

	reply, err := h.client.CompleteWithTools(r.Context(), chatSystemPrompt, req.History, req.Message, workspaceTools, resolve)
	if err != nil {
		slog.Error("ai chat failed", "error", err)
		writeError(w, http.StatusBadGateway, "AI 서버 요청에 실패했습니다")
		return
	}

	writeJSON(w, http.StatusOK, aiChatResponse{Reply: reply})
}
