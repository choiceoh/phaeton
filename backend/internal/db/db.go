package db

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool creates a pool from $DATABASE_URL (or a localhost default).
// Pool sizes are configurable via DB_MAX_CONNS / DB_MIN_CONNS.
// In production (GO_ENV=production), sslmode is forced to "require" unless
// already set to a stricter mode.
func NewPool(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://phaeton:phaeton@localhost:5432/phaeton?sslmode=disable"
	}

	// Enforce SSL in production.
	if os.Getenv("GO_ENV") == "production" {
		dsn = enforceSSL(dsn)
	}

	return NewPoolFromDSN(ctx, dsn)
}

// NewPoolFromDSN creates a pool from an explicit DSN. Useful for tests
// that need to point at an isolated database.
func NewPoolFromDSN(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse db config: %w", err)
	}

	cfg.MaxConns = int32(envInt("DB_MAX_CONNS", 50))
	cfg.MinConns = int32(envInt("DB_MIN_CONNS", 5))

	// statement_timeout: auto-kill queries exceeding this duration (ms).
	// Default 30s — prevents runaway queries from holding connections.
	if timeout := envInt("DB_STATEMENT_TIMEOUT_MS", 30000); timeout > 0 {
		cfg.ConnConfig.RuntimeParams["statement_timeout"] = strconv.Itoa(timeout)
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return pool, nil
}

// enforceSSL upgrades sslmode=disable to sslmode=require.
// If already set to require/verify-ca/verify-full, leaves it alone.
func enforceSSL(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return dsn
	}
	q := u.Query()
	mode := q.Get("sslmode")
	if mode == "" || mode == "disable" || mode == "prefer" {
		q.Set("sslmode", "require")
		u.RawQuery = q.Encode()
		return u.String()
	}
	return dsn
}

func envInt(key string, fallback int) int {
	s := os.Getenv(key)
	if s == "" {
		return fallback
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return v
}
