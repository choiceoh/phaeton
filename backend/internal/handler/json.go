package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/choiceoh/phaeton/backend/internal/schema"
)

type envelope struct {
	Data      any    `json:"data,omitempty"`
	Error     string `json:"error,omitempty"`
	RequestID string `json:"request_id,omitempty"`
}

type listEnvelope struct {
	Data       any   `json:"data"`
	Total      int64 `json:"total"`
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	TotalPages int   `json:"total_pages"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(envelope{Data: data})
}

func writeList(w http.ResponseWriter, data any, total int64, page, limit int) {
	pages := int(total) / limit
	if int(total)%limit != 0 {
		pages++
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(listEnvelope{
		Data:       data,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: pages,
	})
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(envelope{Error: msg})
}

func readJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

// errorStatus maps domain errors to HTTP status codes.
func errorStatus(err error) int {
	switch {
	case errors.Is(err, schema.ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, schema.ErrConflict):
		return http.StatusConflict
	case errors.Is(err, schema.ErrInvalidInput):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

// publicMessage decides what to expose to the client. Domain errors (validation,
// not-found, conflict) are user-facing and shown in full. Anything else is
// considered internal and replaced with a generic message — the original error
// is logged at error level for operators.
func publicMessage(err error) string {
	switch {
	case errors.Is(err, schema.ErrNotFound),
		errors.Is(err, schema.ErrConflict),
		errors.Is(err, schema.ErrInvalidInput):
		return err.Error()
	default:
		return "internal server error"
	}
}

// handleErr is the central error response helper. It logs internal errors at
// error level (with request context) and returns a sanitized message to the client.
func handleErr(w http.ResponseWriter, r *http.Request, err error) {
	status := errorStatus(err)
	msg := publicMessage(err)

	if status >= 500 {
		// Log full details for operators; user sees only "internal server error".
		Log(r).Error("internal error",
			slog.String("error", err.Error()),
			slog.Int("status", status),
		)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(envelope{
		Error:     msg,
		RequestID: RequestID(r),
	})
}
