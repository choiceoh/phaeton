// Seed script — runs bootstrap, creates admin user, and installs preset collections.
// Run: go run ./cmd/seed
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/choiceoh/phaeton/backend/internal/db"
	"github.com/choiceoh/phaeton/backend/internal/handler"
	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/schema"
	"github.com/choiceoh/phaeton/backend/internal/seed"
)

func main() {
	ctx := context.Background()

	pool, err := db.NewPool(ctx)
	if err != nil {
		log.Fatal("db:", err)
	}
	defer pool.Close()

	if err := db.Bootstrap(ctx, pool); err != nil {
		log.Fatal("bootstrap:", err)
	}

	if err := handler.SeedDirector(ctx, pool); err != nil {
		log.Fatal("seed director:", err)
	}
	fmt.Fprintln(os.Stderr, "✓ admin user (admin@phaeton.local / admin)")

	store := schema.NewStore(pool)
	cache := schema.NewCache(store)
	if err := cache.Load(ctx); err != nil {
		log.Fatal("cache load:", err)
	}
	engine := migration.NewEngine(pool, store, cache)

	if err := seed.Run(ctx, engine, cache); err != nil {
		log.Fatal("seed collections:", err)
	}
	fmt.Fprintln(os.Stderr, "✓ preset collections (projects, milestones, staff)")
	fmt.Fprintln(os.Stderr, "seed complete")
}
