package api

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Mount registers all API routes on the given router.
// `logger` is the base slog.Logger that per-request loggers are derived from.
func Mount(r chi.Router, logger *slog.Logger, sh *SchemaHandler, dh *DynHandler) {
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(withRequestID)
	r.Use(withLogger(logger))
	r.Use(withTimeout)

	// Health check.
	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Schema API — collection/field/migration management.
	r.Route("/api/schema", func(r chi.Router) {
		r.Get("/collections", sh.ListCollections)
		r.Post("/collections", sh.CreateCollection)
		r.Get("/collections/{id}", sh.GetCollection)
		r.Patch("/collections/{id}", sh.UpdateCollection)
		r.Delete("/collections/{id}", sh.DeleteCollection)

		r.Post("/collections/{id}/fields", sh.AddField)
		r.Patch("/fields/{fieldId}", sh.UpdateField)
		r.Delete("/fields/{fieldId}", sh.DeleteField)

		r.Get("/migrations/history", sh.MigrationHistory)
		r.Post("/migrations/rollback/{migrationId}", sh.RollbackMigration)
	})

	// Dynamic API — auto-generated CRUD for data tables.
	r.Route("/api/data", func(r chi.Router) {
		r.Get("/{slug}", dh.List)
		r.Post("/{slug}", dh.Create)
		r.Get("/{slug}/aggregate", dh.Aggregate)
		r.Post("/{slug}/bulk", dh.BulkCreate)
		r.Post("/{slug}/bulk-delete", dh.BulkDelete)
		r.Get("/{slug}/{id}", dh.Get)
		r.Patch("/{slug}/{id}", dh.Update)
		r.Delete("/{slug}/{id}", dh.Delete)
	})
}
