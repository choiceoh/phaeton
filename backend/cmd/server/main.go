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
	"github.com/choiceoh/phaeton/backend/internal/events"
	"github.com/choiceoh/phaeton/backend/internal/handler"
	"github.com/choiceoh/phaeton/backend/internal/infra/lifecycle"
	"github.com/choiceoh/phaeton/backend/internal/infra/logging"
	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/samlsp"
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
	viewHandler := handler.NewViewHandler(store)
	historyHandler := handler.NewHistoryHandler(pool, cache)
	memberHandler := handler.NewMemberHandler(pool)

	// Event bus + notification subscriber.
	bus := events.NewBus()
	commentHandler := handler.NewCommentHandler(pool, cache, bus)
	notifHandler := handler.NewNotificationHandler(pool)
	handler.SubscribeNotifications(pool, bus)

	// Login rate limiter: 5 failures / 15 minutes → 30 minute lockout.
	loginLimiter := middleware.NewRateLimiter(5, 15*60*1000, 30*60*1000)
	defer loginLimiter.Close()

	// SAML SP (optional — enabled when SAML_IDP_METADATA_URL is set).
	var samlMiddleware *samlsp.Middleware
	if cfg := samlsp.ConfigFromEnv(); cfg != nil {
		sp, err := samlsp.New(cfg)
		if err != nil {
			logger.Error("SAML SP init failed", "error", err)
			return 1
		}
		samlMiddleware = sp
	}

	// Router.
	r := buildRouter(pool, schemaHandler, dynHandler, viewHandler, historyHandler, memberHandler, commentHandler, notifHandler, logger, loginLimiter, samlMiddleware)

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
	viewH *handler.ViewHandler,
	histH *handler.HistoryHandler,
	memberH *handler.MemberHandler,
	commentH *handler.CommentHandler,
	notifH *handler.NotificationHandler,
	logger *slog.Logger,
	loginLimiter *middleware.RateLimiter,
	samlMW *samlsp.Middleware,
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

	// Webhooks (public — HMAC-verified via WEBHOOK_SECRET).
	webhookH := handler.NewWebhookHandler()
	r.Post("/api/hooks/{topic}", webhookH.Receive)

	// SAML SP endpoints (metadata + ACS).
	if samlMW != nil {
		r.Handle("/saml/*", samlMW.Handler())
	}

	// Protected routes.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth())

		// Current user.
		r.Get("/api/auth/me", handler.Me(pool))
		r.Patch("/api/auth/me", handler.UpdateMe(pool))
		r.Post("/api/auth/password", handler.ChangePassword(pool))

		// Users (list: all, write: director only).
		r.Get("/api/users", handler.ListUsers(pool))
		r.Get("/api/users/{id}", handler.GetUser(pool))
		r.Post("/api/users", handler.CreateUser(pool))
		r.Patch("/api/users/{id}", handler.UpdateUser(pool))

		// Departments.
		r.Get("/api/departments", handler.ListDepartments(pool))
		r.Get("/api/departments/{id}", handler.GetDepartment(pool))
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireRole("director"))
			r.Post("/api/departments", handler.CreateDepartment(pool))
			r.Patch("/api/departments/{id}", handler.UpdateDepartment(pool))
			r.Delete("/api/departments/{id}", handler.DeleteDepartment(pool))
		})

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

				r.Get("/collections/{id}/process", schemaH.GetProcess)
				r.Put("/collections/{id}/process", schemaH.SaveProcess)

				r.Post("/collections/{id}/fields", schemaH.AddField)
				r.Patch("/fields/{fieldId}", schemaH.UpdateField)
				r.Delete("/fields/{fieldId}", schemaH.DeleteField)

				r.Post("/migrations/rollback/{migrationId}", schemaH.RollbackMigration)
			})

			// Collection members
			r.Get("/collections/{id}/members", memberH.List)
			r.Post("/collections/{id}/members", memberH.Add)
			r.Patch("/collections/{id}/members/{userId}", memberH.Update)
			r.Delete("/collections/{id}/members/{userId}", memberH.Remove)

			// Views: read/write for all authenticated users.
			r.Get("/collections/{id}/views", viewH.ListViews)
			r.Post("/collections/{id}/views", viewH.CreateView)
			r.Patch("/views/{viewId}", viewH.UpdateView)
			r.Delete("/views/{viewId}", viewH.DeleteView)
		})

		// Dynamic API — auto-generated CRUD for data tables.
		r.Route("/api/data", func(r chi.Router) {
			r.Use(middleware.CollectionAccess(pool))
			r.Get("/{slug}", dynH.List)
			r.Get("/{slug}/aggregate", dynH.Aggregate)
			r.Get("/{slug}/export.csv", dynH.ExportCSV)
			r.Get("/{slug}/{id}", dynH.Get)

			// Write: director, pm, engineer.
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireRole("director", "pm", "engineer"))
				r.Post("/{slug}", dynH.Create)
				r.Post("/{slug}/bulk", dynH.BulkCreate)
				r.Post("/{slug}/formula-preview", dynH.FormulaPreview)
				r.Patch("/{slug}/batch", dynH.BatchUpdate)
				r.Delete("/{slug}/bulk", dynH.BulkDelete)
				r.Post("/{slug}/import", dynH.ImportCSV)
				r.Patch("/{slug}/{id}", dynH.Update)
				r.Delete("/{slug}/{id}", dynH.Delete)
			})

			// Record history
			r.Get("/{slug}/{id}/history", histH.ListRecordHistory)

			// Comments
			r.Get("/{slug}/{id}/comments", commentH.List)
			r.Post("/{slug}/{id}/comments", commentH.Create)
			r.Patch("/{slug}/{id}/comments/{commentId}", commentH.Update)
			r.Delete("/{slug}/{id}/comments/{commentId}", commentH.Delete)
		})

		// File upload & download (authenticated).
		r.Post("/api/upload", handler.Upload)
		r.Handle("/api/uploads/*", http.StripPrefix("/api/uploads/",
			http.FileServer(http.Dir("uploads"))))

		// Notifications
		r.Get("/api/notifications", notifH.List)
		r.Get("/api/notifications/unread-count", notifH.UnreadCount)
		r.Patch("/api/notifications/{id}/read", notifH.MarkRead)
		r.Post("/api/notifications/read-all", notifH.MarkAllRead)
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
