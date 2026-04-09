// Package testutil provides shared helpers for backend integration tests.
//
// All helpers expect a TEST_DATABASE_URL pointing at a *separate* database
// from the dev one (e.g. phaeton_test). They DROP and recreate the entire
// schema between tests, so never point this at production data.
package testutil

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/db"
)

// NewTestPool opens a pgx pool against TEST_DATABASE_URL.
// If the env var is unset the test is skipped — this lets `go test ./...`
// keep working in environments without a Postgres handy (e.g. quick lint runs).
func NewTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}

	pool, err := db.NewPoolFromDSN(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect to test db: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// ResetSchema drops and re-creates the meta/data/auth/_history schemas via
// the production Bootstrap function. Slower than TRUNCATE but bullet-proof
// for tests that touch migration DDL — each test starts with a clean slate
// and any dynamically-created data.* tables go away.
func ResetSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()

	drops := []string{
		`DROP SCHEMA IF EXISTS _meta CASCADE`,
		`DROP SCHEMA IF EXISTS _history CASCADE`,
		`DROP SCHEMA IF EXISTS data CASCADE`,
		`DROP SCHEMA IF EXISTS auth CASCADE`,
	}
	for _, stmt := range drops {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatalf("reset: %s: %v", stmt, err)
		}
	}

	if err := db.Bootstrap(ctx, pool); err != nil {
		t.Fatalf("reset bootstrap: %v", err)
	}
}
