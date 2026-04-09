package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Bootstrap creates the three PostgreSQL schemas (_meta, _history, data)
// and the meta/history tables if they don't already exist.
// All operations run inside a single transaction for atomicity.
func Bootstrap(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin bootstrap tx: %w", err)
	}
	defer tx.Rollback(ctx)

	stmts := []string{
		// --- schemas ---
		`CREATE SCHEMA IF NOT EXISTS _meta`,
		`CREATE SCHEMA IF NOT EXISTS _history`,
		`CREATE SCHEMA IF NOT EXISTS data`,

		// --- _meta.collections ---
		`CREATE TABLE IF NOT EXISTS _meta.collections (
			id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			slug        VARCHAR(63) UNIQUE NOT NULL,
			label       VARCHAR(255) NOT NULL,
			description TEXT,
			icon        VARCHAR(63),
			is_system   BOOLEAN NOT NULL DEFAULT FALSE,
			sort_order  INTEGER NOT NULL DEFAULT 0,
			created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
			created_by  UUID
		)`,

		// --- _meta.fields ---
		`CREATE TABLE IF NOT EXISTS _meta.fields (
			id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			collection_id   UUID NOT NULL REFERENCES _meta.collections(id) ON DELETE CASCADE,
			slug            VARCHAR(63) NOT NULL,
			label           VARCHAR(255) NOT NULL,
			field_type      VARCHAR(31) NOT NULL,
			is_required     BOOLEAN NOT NULL DEFAULT FALSE,
			is_unique       BOOLEAN NOT NULL DEFAULT FALSE,
			is_indexed      BOOLEAN NOT NULL DEFAULT FALSE,
			default_value   JSONB,
			options         JSONB,
			sort_order      INTEGER NOT NULL DEFAULT 0,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE(collection_id, slug)
		)`,

		// --- _meta.relations ---
		`CREATE TABLE IF NOT EXISTS _meta.relations (
			id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			field_id             UUID UNIQUE NOT NULL REFERENCES _meta.fields(id) ON DELETE CASCADE,
			target_collection_id UUID NOT NULL REFERENCES _meta.collections(id),
			relation_type        VARCHAR(15) NOT NULL,
			junction_table       VARCHAR(63),
			on_delete            VARCHAR(15) NOT NULL DEFAULT 'SET NULL'
		)`,

		// --- _history.schema_migrations ---
		`CREATE TABLE IF NOT EXISTS _history.schema_migrations (
			id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			collection_id   UUID NOT NULL,
			operation       VARCHAR(31) NOT NULL,
			payload         JSONB NOT NULL,
			ddl_up          TEXT NOT NULL,
			ddl_down        TEXT NOT NULL,
			safety_level    VARCHAR(15) NOT NULL DEFAULT 'SAFE',
			created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			applied_at      TIMESTAMPTZ,
			applied_by      UUID,
			rolled_back_at  TIMESTAMPTZ
		)`,
	}

	for _, stmt := range stmts {
		if _, err := tx.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("bootstrap exec: %w", err)
		}
	}

	return tx.Commit(ctx)
}
