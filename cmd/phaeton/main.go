package main

import (
	"context"
	"fmt"
	"log"
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
	ctx := context.Background()

	// --- Database ---
	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	if err := database.Bootstrap(ctx, pool); err != nil {
		log.Fatalf("bootstrap: %v", err)
	}
	log.Println("database bootstrap complete")

	// --- Core services ---
	store := schema.NewStore(pool)
	cache := schema.NewCache(store)
	if err := cache.Load(ctx); err != nil {
		log.Fatalf("cache load: %v", err)
	}
	log.Printf("cache loaded: %d collections", len(cache.Collections()))

	engine := migration.NewEngine(pool, store, cache)

	// --- HTTP ---
	schemaHandler := api.NewSchemaHandler(store, cache, engine)
	dynHandler := api.NewDynHandler(pool, cache)

	r := chi.NewRouter()
	api.Mount(r, schemaHandler, dynHandler)

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
		log.Printf("phaeton schema engine listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	<-done
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
	log.Println("server stopped")
}
