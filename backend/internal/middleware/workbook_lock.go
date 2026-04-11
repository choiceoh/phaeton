package middleware

import (
	"encoding/json"
	"net/http"

	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// WorkbookLock blocks write requests (POST/PATCH/DELETE) on data endpoints when
// the owning workbook is locked by a different user. If no lock is held, or the
// requesting user holds the lock, the request passes through.
func WorkbookLock(cache *schema.Cache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Only gate mutations.
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}

			user, ok := GetUser(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}

			slug := extractSlug(r.URL.Path)
			if slug == "" {
				next.ServeHTTP(w, r)
				return
			}

			col, ok2 := cache.CollectionBySlug(slug)
			if !ok2 || col.WorkbookID == "" {
				next.ServeHTTP(w, r)
				return
			}

			wb, ok3 := cache.WorkbookByID(col.WorkbookID)
			if !ok3 || wb.LockedBy == "" {
				// No lock → allow.
				next.ServeHTTP(w, r)
				return
			}

			if wb.LockedBy == user.UserID {
				// Lock owner → allow.
				next.ServeHTTP(w, r)
				return
			}

			// Locked by another user → block with 423 Locked.
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusLocked)
			json.NewEncoder(w).Encode(map[string]any{
				"error":     "workbook is locked by another user",
				"locked_by": wb.LockedBy,
				"locked_at": wb.LockedAt,
			})
		})
	}
}

