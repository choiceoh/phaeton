package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/db"
	"github.com/choiceoh/phaeton/backend/internal/handler"
	"github.com/choiceoh/phaeton/backend/internal/infra/lifecycle"
	"github.com/choiceoh/phaeton/backend/internal/infra/logging"
	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

//go:embed static/*
var staticFS embed.FS

const version = "0.2.0"

func main() {
	os.Exit(run())
}

func run() int {
	// Logging.
	color := os.Getenv("NO_COLOR") == ""
	logger := slog.New(logging.NewConsoleHandler(os.Stderr, slog.LevelInfo, color))
	slog.SetDefault(logger)

	// Database pool.
	pool, err := db.NewPool(context.Background())
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		return 1
	}
	defer pool.Close()

	// Bootstrap all schemas + tables (idempotent).
	if err := db.Bootstrap(context.Background(), pool); err != nil {
		logger.Error("bootstrap failed", "error", err)
		return 1
	}
	logger.Info("database bootstrap complete")

	// Seed the initial director user if none exist.
	if err := handler.SeedDirector(context.Background(), pool); err != nil {
		logger.Warn("seed director failed", "error", err)
	}

	// Schema engine (store + cache + migration engine + data engine).
	store := schema.NewStore(pool)
	cache := schema.NewCache(store)
	if err := cache.Load(context.Background()); err != nil {
		logger.Error("cache load failed", "error", err)
		return 1
	}
	logger.Info("schema cache loaded", "collections", len(cache.Collections()))

	migEngine := migration.NewEngine(pool, store, cache)

	// Schema & dynamic handlers (PR #53 — built-in dynamic handler).
	schemaHandler := handler.NewSchemaHandler(store, cache, migEngine)
	dynHandler := handler.NewDynHandler(pool, cache)

	// Login rate limiter: 5 failures / 15 minutes → 30 minute lockout.
	loginLimiter := middleware.NewRateLimiter(5, 15*60*1000, 30*60*1000)
	defer loginLimiter.Close()

	// Router.
	r := buildRouter(pool, schemaHandler, dynHandler, logger, loginLimiter)

	addr := envOr("ADDR", ":8080")
	srv := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	startedAt := time.Now()

	return lifecycle.RunWithSignals(func(ctx context.Context) error {
		ln, err := net.Listen("tcp", addr)
		if err != nil {
			return fmt.Errorf("listen: %w", err)
		}

		logging.PrintBanner(os.Stderr, logging.BannerInfo{
			Version: version,
			Addr:    ln.Addr().String(),
			DB:      "connected",
		}, color)

		go func() {
			<-ctx.Done()
			logging.PrintShutdown(os.Stderr, time.Since(startedAt), color)
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := srv.Shutdown(shutdownCtx); err != nil {
				logger.Error("shutdown failed", "error", err)
			}
		}()

		if err := srv.Serve(ln); err != http.ErrServerClosed {
			return err
		}
		return nil
	}, logger)
}

func buildRouter(
	pool *pgxpool.Pool,
	schemaH *handler.SchemaHandler,
	dynH *handler.DynHandler,
	logger *slog.Logger,
	loginLimiter *middleware.RateLimiter,
) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware.
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.Logger(logger))
	r.Use(middleware.CORS())
	r.Use(chimw.Recoverer)

	// Health.
	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth (public).
	r.Post("/api/auth/login", handler.Login(pool, loginLimiter))
	r.Post("/api/auth/logout", handler.Logout())

	// Protected routes.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth())

		// Current user.
		r.Get("/api/auth/me", handler.Me())
		r.Get("/api/users", handler.ListUsers(pool))
		r.Post("/api/users", handler.CreateUser(pool))

		// Schema API — collection/field/migration management.
		r.Route("/api/schema", func(r chi.Router) {
			// Read-only: all authenticated users.
			r.Get("/collections", schemaH.ListCollections)
			r.Get("/collections/{id}", schemaH.GetCollection)
			r.Get("/migrations/history", schemaH.MigrationHistory)

			// Write: director and pm only.
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireRole("director", "pm"))
				r.Post("/collections", schemaH.CreateCollection)
				r.Patch("/collections/{id}", schemaH.UpdateCollection)
				r.Delete("/collections/{id}", schemaH.DeleteCollection)

				r.Post("/collections/{id}/fields", schemaH.AddField)
				r.Patch("/fields/{fieldId}", schemaH.UpdateField)
				r.Delete("/fields/{fieldId}", schemaH.DeleteField)

				r.Post("/migrations/rollback/{migrationId}", schemaH.RollbackMigration)
			})
		})

		// Dynamic API — auto-generated CRUD for data tables.
		r.Route("/api/data", func(r chi.Router) {
			// Read: all authenticated users.
			r.Get("/{slug}", dynH.List)
			r.Get("/{slug}/{id}", dynH.Get)

			// Write: director, pm, engineer.
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireRole("director", "pm", "engineer"))
				r.Post("/{slug}", dynH.Create)
				r.Patch("/{slug}/{id}", dynH.Update)
				r.Delete("/{slug}/{id}", dynH.Delete)
			})
		})
	})

	// SPA static files — catch-all for non-API routes.
	serveSPA(r)

	return r
}

func serveSPA(r *chi.Mux) {
	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		slog.Warn("no embedded static files, SPA serving disabled")
		return
	}

	fileServer := http.FileServer(http.FS(sub))

	indexHTML, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		slog.Warn("index.html not found in embedded static", "error", err)
		indexHTML = []byte("<!DOCTYPE html><html><body>phaeton</body></html>")
	}

	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		path := strings.TrimPrefix(req.URL.Path, "/")
		if path == "" {
			writeIndex(w, indexHTML)
			return
		}

		info, err := fs.Stat(sub, path)
		if err != nil || info.IsDir() {
			writeIndex(w, indexHTML)
			return
		}
		fileServer.ServeHTTP(w, req)
	})
}

func writeIndex(w http.ResponseWriter, indexHTML []byte) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(indexHTML)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

