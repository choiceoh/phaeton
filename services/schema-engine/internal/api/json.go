package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/schema"
)

type envelope struct {
	Data  any    `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
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

func handleErr(w http.ResponseWriter, err error) {
	writeError(w, errorStatus(err), err.Error())
}
