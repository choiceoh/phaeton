// Package testutil provides helpers for integration tests that require PostgreSQL.
//
// Usage:
//
//	func TestSomething(t *testing.T) {
//	    pool := testutil.SetupDB(t)
//	    // pool is connected to phaeton_test with schemas bootstrapped.
//	    // All _meta, _history, auth, data tables are cleaned before each test.
//	}
//
// Set TEST_DATABASE_URL to override the default DSN.
// Tests are skipped if the database is unreachable.
package testutil

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/db"
)

const defaultTestDSN = "postgres://phaeton:phaeton@localhost:5432/phaeton_test?sslmode=disable"

// bootstrapOnce ensures bootstrap runs only once per test process.
var bootstrapOnce sync.Once
var bootstrapErr error

// mu serialises test setup/teardown to prevent deadlocks when multiple
// test functions run in parallel against the same database.
var mu sync.Mutex

// SetupDB returns a pool connected to the test database.
// It bootstraps the schema (once) and truncates all tables before each test.
// The test is skipped if the database is unreachable.
func SetupDB(t *testing.T) *pgxpool.Pool {
	t.Helper()

	if testing.Short() {
		t.Skip("skipping integration test in -short mode")
	}

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = defaultTestDSN
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := db.NewPoolFromDSN(ctx, dsn)
	if err != nil {
		t.Skipf("skipping integration test: cannot connect to test DB: %v", err)
	}

	// Bootstrap schemas and tables (once per process).
	bootstrapOnce.Do(func() {
		bootstrapErr = db.Bootstrap(ctx, pool)
	})
	if bootstrapErr != nil {
		pool.Close()
		t.Fatalf("bootstrap test DB: %v", bootstrapErr)
	}

	// Serialise truncation to prevent deadlocks.
	mu.Lock()
	truncate(t, pool)
	mu.Unlock()

	t.Cleanup(func() {
		pool.Close()
	})

	return pool
}

func truncate(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	ctx := context.Background()

	// Drop all dynamic tables and sequences in the data schema first
	// (single statement avoids deadlocks).
	var dataTables []string
	rows, err := pool.Query(ctx, `SELECT tablename FROM pg_tables WHERE schemaname = 'data'`)
	if err != nil {
		t.Fatalf("list data tables: %v", err)
	}
	for rows.Next() {
		var name string
		rows.Scan(&name)
		dataTables = append(dataTables, "data."+name)
	}
	rows.Close()
	if len(dataTables) > 0 {
		drop := fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE", joinComma(dataTables))
		if _, err := pool.Exec(ctx, drop); err != nil {
			t.Fatalf("drop data tables: %v", err)
		}
	}

	var seqs []string
	srows, err := pool.Query(ctx, `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'data'`)
	if err != nil {
		t.Fatalf("list data sequences: %v", err)
	}
	for srows.Next() {
		var name string
		srows.Scan(&name)
		seqs = append(seqs, "data."+name)
	}
	srows.Close()
	if len(seqs) > 0 {
		drop := fmt.Sprintf("DROP SEQUENCE IF EXISTS %s", joinComma(seqs))
		pool.Exec(ctx, drop)
	}

	// Truncate meta/history/auth tables in one TRUNCATE CASCADE statement.
	metaTables := []string{
		"_history.automation_runs",
		"_history.record_changes",
		"_history.schema_migrations",
		"_meta.automation_actions",
		"_meta.automation_conditions",
		"_meta.automations",
		"_meta.saved_views",
		"_meta.collection_members",
		"_meta.notifications",
		"_meta.comments",
		"_meta.process_transitions",
		"_meta.process_statuses",
		"_meta.processes",
		"_meta.views",
		"_meta.relations",
		"_meta.fields",
		"_meta.collections",
		"auth.users",
		"auth.departments",
	}
	trunc := fmt.Sprintf("TRUNCATE %s CASCADE", joinComma(metaTables))
	if _, err := pool.Exec(ctx, trunc); err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func joinComma(ss []string) string {
	if len(ss) == 0 {
		return ""
	}
	out := ss[0]
	for _, s := range ss[1:] {
		out += ", " + s
	}
	return out
}
