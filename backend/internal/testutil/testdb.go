// Package testutil provides helpers for integration tests that need a real PostgreSQL database.
// Usage:
//
//	func TestSomething(t *testing.T) {
//	    pool := testutil.NewTestPool(t)
//	    // pool is connected to a fresh schema; tables are cleaned up after the test.
//	    ...
//	}
//
// Set TEST_DATABASE_URL to enable integration tests; otherwise they are skipped.
package testutil

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewTestPool returns a pgxpool connected to the test database.
// It creates a unique schema for isolation and drops it on cleanup.
// The test is skipped if TEST_DATABASE_URL is not set.
func NewTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	// Create an isolated schema for this test.
	schemaName := fmt.Sprintf("test_%s_%d", sanitize(t.Name()), os.Getpid())
	if _, err := pool.Exec(ctx, fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %q", schemaName)); err != nil {
		pool.Close()
		t.Fatalf("failed to create test schema: %v", err)
	}

	// Set search_path so unqualified queries use the test schema.
	if _, err := pool.Exec(ctx, fmt.Sprintf("SET search_path TO %q, public", schemaName)); err != nil {
		pool.Close()
		t.Fatalf("failed to set search_path: %v", err)
	}

	t.Cleanup(func() {
		// Drop the test schema.
		_, _ = pool.Exec(context.Background(), fmt.Sprintf("DROP SCHEMA IF EXISTS %q CASCADE", schemaName))
		pool.Close()
	})

	return pool
}

// sanitize removes characters that are not safe for a schema name.
func sanitize(s string) string {
	out := make([]byte, 0, len(s))
	for _, c := range []byte(s) {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' {
			out = append(out, c)
		}
	}
	if len(out) > 50 {
		out = out[:50]
	}
	return string(out)
}
