package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"
)

// Client talks to a local vLLM (OpenAI-compatible) server.
type Client struct {
	baseURL    string
	model      string // explicit override via AI_MODEL env; empty = auto-detect
	httpClient *http.Client

	mu            sync.Mutex
	cachedModel   string
	cachedModelAt time.Time
}

// modelCacheTTL controls how long the auto-detected model name is cached.
const modelCacheTTL = 30 * time.Second

func NewClient() *Client {
	base := os.Getenv("AI_BASE_URL")
	if base == "" {
		base = "http://localhost:8000"
	}
	model := os.Getenv("AI_MODEL") // empty = auto-detect from vLLM
	return &Client{
		baseURL: base,
		model:   model,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// modelsResponse is the response from /v1/models.
type modelsResponse struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
}

// resolveModel returns the model to use. If AI_MODEL is set, use that.
// Otherwise query the vLLM /v1/models endpoint and cache the result.
func (c *Client) resolveModel(ctx context.Context) (string, error) {
	if c.model != "" {
		return c.model, nil
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.cachedModel != "" && time.Since(c.cachedModelAt) < modelCacheTTL {
		return c.cachedModel, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/v1/models", nil)
	if err != nil {
		return "", fmt.Errorf("create models request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if c.cachedModel != "" {
			slog.Warn("failed to refresh model list, using cached model", "model", c.cachedModel, "error", err)
			return c.cachedModel, nil
		}
		return "", fmt.Errorf("fetch models: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		if c.cachedModel != "" {
			slog.Warn("failed to refresh model list, using cached model", "model", c.cachedModel, "status", resp.StatusCode)
			return c.cachedModel, nil
		}
		return "", fmt.Errorf("models endpoint returned %d: %s", resp.StatusCode, string(b))
	}

	var models modelsResponse
	if err := json.NewDecoder(resp.Body).Decode(&models); err != nil {
		return "", fmt.Errorf("decode models response: %w", err)
	}
	if len(models.Data) == 0 {
		return "", fmt.Errorf("no models available on vLLM server")
	}

	detected := models.Data[0].ID
	if c.cachedModel != detected {
		slog.Info("AI model detected", "model", detected)
	}
	c.cachedModel = detected
	c.cachedModelAt = time.Now()
	return detected, nil
}

// chatRequest is the OpenAI-compatible chat completion request.
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
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
	model, err := c.resolveModel(ctx)
	if err != nil {
		return "", fmt.Errorf("resolve model: %w", err)
	}

	body := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
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
	model, err := c.resolveModel(ctx)
	if err != nil {
		return "", fmt.Errorf("resolve model: %w", err)
	}

	msgs := []chatMessage{
		{Role: "system", Content: system},
	}
	for _, h := range history {
		msgs = append(msgs, chatMessage{Role: h.Role, Content: h.Content})
	}
	msgs = append(msgs, chatMessage{Role: "user", Content: userMsg})

	body := chatRequest{
		Model:       model,
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
