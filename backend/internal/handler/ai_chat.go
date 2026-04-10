package handler

import (
	"fmt"
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
- When referring to UI elements, use the Korean labels as they appear in the app.`

// buildChatSystemPrompt adds existing workspace apps to the chat system prompt.
func (h *AIHandler) buildChatSystemPrompt(r *http.Request) string {
	collections, err := h.store.ListCollections(r.Context())
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
		fields, err := h.store.ListFields(r.Context(), col.ID)
		if err != nil {
			continue
		}

		sb.WriteString(fmt.Sprintf("\n### %s (%s)\n", col.Label, col.Slug))
		if col.Description != "" {
			sb.WriteString(fmt.Sprintf("설명: %s\n", col.Description))
		}
		if len(fields) > 0 {
			sb.WriteString("필드: ")
			names := make([]string, 0, len(fields))
			for _, f := range fields {
				names = append(names, fmt.Sprintf("%s(%s)", f.Label, f.FieldType))
			}
			sb.WriteString(strings.Join(names, ", "))
			sb.WriteString("\n")
		}
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

	systemPrompt := h.buildChatSystemPrompt(r)

	// Build conversation: system + history + current message.
	// We pass the full conversation as a single user message with history context
	// because the ai.Client.Complete only takes system+user. For proper multi-turn,
	// we use CompleteChat.
	reply, err := h.client.CompleteChat(r.Context(), systemPrompt, req.History, req.Message)
	if err != nil {
		slog.Error("ai chat failed", "error", err)
		writeError(w, http.StatusBadGateway, "AI 서버 요청에 실패했습니다")
		return
	}

	writeJSON(w, http.StatusOK, aiChatResponse{Reply: reply})
}
