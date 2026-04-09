// Package server wires HTTP routes onto a chi router.
//
// Extracted from cmd/server/main.go so integration tests can spin up
// the same router via httptest without going through main(). The SPA
// static-file serving is intentionally NOT in here — it depends on the
// embed.FS declared in main, and tests don't need it.
package server

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/handler"
	"github.com/choiceoh/phaeton/backend/internal/middleware"
)

// Deps bundles everything BuildRouter needs. Constructed once in main()
// or in test setup, never mutated after wiring.
type Deps struct {
	Pool         *pgxpool.Pool
	Schema       *handler.SchemaHandler
	Dyn          *handler.DynHandler
	Logger       *slog.Logger
	LoginLimiter *middleware.RateLimiter
}

// BuildRouter registers all /api/* routes and returns the chi.Mux.
// Callers (main.go) may attach an SPA catch-all afterwards.
func BuildRouter(d Deps) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware.
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.Logger(d.Logger))
	r.Use(middleware.CORS())
	r.Use(chimw.Recoverer)

	// Health.
	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth (public).
	r.Post("/api/auth/login", handler.Login(d.Pool, d.LoginLimiter))

	// Protected routes.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth())

		// Current user.
		r.Get("/api/auth/me", handler.Me())
		r.Get("/api/users", handler.ListUsers(d.Pool))
		r.Post("/api/users", handler.CreateUser(d.Pool))

		// Schema API — collection/field/migration management.
		r.Route("/api/schema", func(r chi.Router) {
			r.Get("/collections", d.Schema.ListCollections)
			r.Post("/collections", d.Schema.CreateCollection)
			r.Get("/collections/{id}", d.Schema.GetCollection)
			r.Patch("/collections/{id}", d.Schema.UpdateCollection)
			r.Delete("/collections/{id}", d.Schema.DeleteCollection)

			r.Post("/collections/{id}/fields", d.Schema.AddField)
			r.Patch("/fields/{fieldId}", d.Schema.UpdateField)
			r.Delete("/fields/{fieldId}", d.Schema.DeleteField)

			r.Get("/migrations/history", d.Schema.MigrationHistory)
			r.Post("/migrations/rollback/{migrationId}", d.Schema.RollbackMigration)
		})

		// Dynamic API — auto-generated CRUD for data tables.
		r.Route("/api/data", func(r chi.Router) {
			r.Get("/{slug}", d.Dyn.List)
			r.Post("/{slug}", d.Dyn.Create)
			r.Get("/{slug}/{id}", d.Dyn.Get)
			r.Patch("/{slug}/{id}", d.Dyn.Update)
			r.Delete("/{slug}/{id}", d.Dyn.Delete)
		})
	})

	return r
}
