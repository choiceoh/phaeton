package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/choiceoh/phaeton/backend/internal/infra/apierr"
)

// WebhookEvent is the envelope stored for each received webhook.
type WebhookEvent struct {
	ID        string          `json:"id"`
	Topic     string          `json:"topic"`
	Payload   json.RawMessage `json:"payload"`
	Received  time.Time       `json:"received_at"`
	Source    string          `json:"source,omitempty"`
	Processed bool           `json:"processed"`
}

// WebhookHandler provides a generic webhook receiver.
// Individual topic handlers are registered via Handle().
type WebhookHandler struct {
	secret   string
	handlers map[string]TopicHandler
}

// TopicHandler processes a webhook payload for a specific topic.
type TopicHandler func(payload json.RawMessage) error

// NewWebhookHandler creates a handler with optional HMAC-SHA256 verification.
// Set WEBHOOK_SECRET env var to enable signature validation.
func NewWebhookHandler() *WebhookHandler {
	return &WebhookHandler{
		secret:   os.Getenv("WEBHOOK_SECRET"),
		handlers: make(map[string]TopicHandler),
	}
}

// Handle registers a handler for a specific topic (URL path segment).
func (h *WebhookHandler) Handle(topic string, fn TopicHandler) {
	h.handlers[topic] = fn
}

// Receive handles POST /api/hooks/{topic}.
func (h *WebhookHandler) Receive(w http.ResponseWriter, r *http.Request) {
	topic := chi.URLParam(r, "topic")
	if topic == "" {
		apierr.BadRequest("topic is required").Write(w)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB max
	defer r.Body.Close()
	if err != nil {
		apierr.BadRequest("failed to read body").Write(w)
		return
	}

	// Verify HMAC signature if secret is configured.
	if h.secret != "" {
		sig := r.Header.Get("X-Signature-256")
		if sig == "" {
			sig = r.Header.Get("X-Hub-Signature-256")
		}
		if !verifyHMAC([]byte(h.secret), body, sig) {
			apierr.Unauthorized("invalid signature").Write(w)
			return
		}
	}

	slog.Info("webhook received",
		"topic", topic,
		"source", r.Header.Get("X-Webhook-Source"),
		"size", len(body),
	)

	fn, ok := h.handlers[topic]
	if !ok {
		// Accept but log — no handler registered yet for this topic.
		slog.Warn("webhook: no handler for topic", "topic", topic)
		writeJSON(w, http.StatusAccepted, map[string]string{
			"status": "accepted",
			"note":   "no handler registered for topic",
		})
		return
	}

	if err := fn(json.RawMessage(body)); err != nil {
		slog.Error("webhook: handler failed", "topic", topic, "error", err)
		apierr.Internal("webhook processing failed").Write(w)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "processed"})
}

// verifyHMAC checks the HMAC-SHA256 signature.
// Expected format: "sha256=<hex>".
func verifyHMAC(secret, payload []byte, signature string) bool {
	if len(signature) < 8 || signature[:7] != "sha256=" {
		return false
	}
	sig, err := hex.DecodeString(signature[7:])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(payload)
	return hmac.Equal(mac.Sum(nil), sig)
}
