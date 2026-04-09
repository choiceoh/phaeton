package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"phaeton/internal/api"
	"phaeton/internal/config"
	"phaeton/internal/database"
	"phaeton/internal/migration"
	"phaeton/internal/schema"
)

func main() {
	cfg := config.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	ctx := context.Background()

	// --- Database ---
	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connect failed", slog.Any("error", err))
		os.Exit(1)
	}

	if err := database.Bootstrap(ctx, pool); err != nil {
		logger.Error("bootstrap failed", slog.Any("error", err))
		pool.Close()
		os.Exit(1)
	}
	logger.Info("database bootstrap complete")

	// --- Core services ---
	store := schema.NewStore(pool)
	cache := schema.NewCache(store)
	if err := cache.Load(ctx); err != nil {
		logger.Error("cache load failed", slog.Any("error", err))
		pool.Close()
		os.Exit(1)
	}
	logger.Info("cache loaded", slog.Int("collections", len(cache.Collections())))

	engine := migration.NewEngine(pool, store, cache)

	// --- HTTP ---
	schemaHandler := api.NewSchemaHandler(store, cache, engine)
	dynHandler := api.NewDynHandler(pool, cache)

	r := chi.NewRouter()
	api.Mount(r, logger, schemaHandler, dynHandler)

	addr := fmt.Sprintf(":%d", cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown.
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		logger.Info("phaeton listening", slog.String("addr", addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	<-done
	logger.Info("shutting down")

	// Step 1: stop accepting new connections, wait for in-flight requests to finish
	// (or hit the deadline). HTTP timeout is shorter than the pool drain so connections
	// have a chance to release back to the pool before we close it.
	httpCtx, cancelHTTP := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelHTTP()
	if err := srv.Shutdown(httpCtx); err != nil {
		logger.Error("http shutdown error", slog.Any("error", err))
	}

	// Step 2: close the DB pool. pgxpool.Close blocks until all idle connections
	// are released and active queries either complete or have their contexts
	// cancelled (which the http.Server.Shutdown deadline guarantees by then).
	poolDone := make(chan struct{})
	go func() {
		pool.Close()
		close(poolDone)
	}()
	select {
	case <-poolDone:
		logger.Info("pool closed")
	case <-time.After(10 * time.Second):
		logger.Warn("pool close timeout — forcing exit")
	}

	logger.Info("server stopped")
}
