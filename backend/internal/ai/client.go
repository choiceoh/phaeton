package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Client talks to a local vLLM (OpenAI-compatible) server.
type Client struct {
	baseURL    string
	model      string
	httpClient *http.Client
}

func NewClient() *Client {
	base := os.Getenv("AI_BASE_URL")
	if base == "" {
		base = "http://localhost:8000"
	}
	model := os.Getenv("AI_MODEL")
	if model == "" {
		model = "gemma4"
	}
	return &Client{
		baseURL: base,
		model:   model,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// chatRequest is the OpenAI-compatible chat completion request.
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

// chatMessage supports both plain text and multimodal content.
// When Content is set, it's sent as a string; when Parts is set, it's sent as an array.
type chatMessage struct {
	Role    string        `json:"role"`
	Content string        `json:"-"`
	Parts   []contentPart `json:"-"`
}

// MarshalJSON handles the dual content format (string vs array).
func (m chatMessage) MarshalJSON() ([]byte, error) {
	if len(m.Parts) > 0 {
		type alias struct {
			Role    string        `json:"role"`
			Content []contentPart `json:"content"`
		}
		return json.Marshal(alias{Role: m.Role, Content: m.Parts})
	}
	type alias struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	return json.Marshal(alias{Role: m.Role, Content: m.Content})
}

// contentPart is a single part of a multimodal message.
type contentPart struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ImageURL *imageURL `json:"image_url,omitempty"`
}

type imageURL struct {
	URL string `json:"url"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// Complete sends a chat completion request and returns the assistant message.
func (c *Client) Complete(ctx context.Context, system, user string) (string, error) {
	body := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Temperature: 0.3,
		MaxTokens:   4096,
	}

	return c.doRequest(ctx, body)
}

// CompleteWithImage sends a vision request with text + base64 PNG image.
func (c *Client) CompleteWithImage(ctx context.Context, system, userText string, pngBase64 string) (string, error) {
	body := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{
				Role: "user",
				Parts: []contentPart{
					{Type: "text", Text: userText},
					{Type: "image_url", ImageURL: &imageURL{
						URL: "data:image/png;base64," + pngBase64,
					}},
				},
			},
		},
		Temperature: 0.3,
		MaxTokens:   4096,
	}

	return c.doRequest(ctx, body)
}

// ChatMessage is the exported type for multi-turn conversation history.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// CompleteChat sends a multi-turn chat request with history and returns the assistant reply.
func (c *Client) CompleteChat(ctx context.Context, system string, history []ChatMessage, userMsg string) (string, error) {
	msgs := []chatMessage{
		{Role: "system", Content: system},
	}
	for _, h := range history {
		msgs = append(msgs, chatMessage{Role: h.Role, Content: h.Content})
	}
	msgs = append(msgs, chatMessage{Role: "user", Content: userMsg})

	body := chatRequest{
		Model:       c.model,
		Messages:    msgs,
		Temperature: 0.5,
		MaxTokens:   2048,
	}
	return c.doRequest(ctx, body)
}

// doRequest is the shared HTTP call logic.
func (c *Client) doRequest(ctx context.Context, body chatRequest) (string, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("ai request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ai server returned %d: %s", resp.StatusCode, string(b))
	}

	var result chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("ai returned no choices")
	}
	return result.Choices[0].Message.Content, nil
}
