package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Mount registers all API routes on the given router.
func Mount(r chi.Router, sh *SchemaHandler, dh *DynHandler) {
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)

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
		r.Get("/{slug}/{id}", dh.Get)
		r.Patch("/{slug}/{id}", dh.Update)
		r.Delete("/{slug}/{id}", dh.Delete)
	})
}
