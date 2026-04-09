package testutil

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/handler"
)

// Default credentials seeded by SeedDirector. Match handler.SeedDirector exactly.
const (
	DirectorEmail    = "admin@phaeton.local"
	DirectorPassword = "admin"
)

// SeedDirector creates the initial director user via the production seed
// function. Idempotent — calling it on a populated DB is a no-op.
func SeedDirector(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if err := handler.SeedDirector(context.Background(), pool); err != nil {
		t.Fatalf("seed director: %v", err)
	}
}
