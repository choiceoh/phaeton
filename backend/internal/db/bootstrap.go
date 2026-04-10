package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Bootstrap creates the PostgreSQL schemas (_meta, _history, data, auth)
// and their tables if they don't already exist.
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
		`CREATE SCHEMA IF NOT EXISTS auth`,

		// Required for gen_random_uuid().
		`CREATE EXTENSION IF NOT EXISTS pgcrypto`,

		// --- auth.users ---
		// Not part of the schema engine metadata — this is an auth primitive
		// managed directly by the handler/auth.go code, not through collections.
		`CREATE TABLE IF NOT EXISTS auth.users (
			id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			email       VARCHAR(255) NOT NULL,
			name        VARCHAR(255) NOT NULL,
			password    TEXT NOT NULL,
			role        VARCHAR(31) NOT NULL DEFAULT 'viewer',
			is_active   BOOLEAN NOT NULL DEFAULT true,
			created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email_lower ON auth.users (LOWER(email))`,
		`CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth.users(role)`,

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

		// Upgrade: add access_config column for per-collection permissions.
		`ALTER TABLE _meta.collections ADD COLUMN IF NOT EXISTS access_config JSONB DEFAULT '{}'`,

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
			width           SMALLINT NOT NULL DEFAULT 6,
			height          SMALLINT NOT NULL DEFAULT 1,
			sort_order      INTEGER NOT NULL DEFAULT 0,
			is_layout       BOOLEAN NOT NULL DEFAULT FALSE,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE(collection_id, slug)
		)`,

		// Upgrade: add is_layout column for existing installations.
		`ALTER TABLE _meta.fields ADD COLUMN IF NOT EXISTS is_layout BOOLEAN NOT NULL DEFAULT FALSE`,

		// --- _meta.relations ---
		`CREATE TABLE IF NOT EXISTS _meta.relations (
			id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			field_id             UUID UNIQUE NOT NULL REFERENCES _meta.fields(id) ON DELETE CASCADE,
			target_collection_id UUID NOT NULL REFERENCES _meta.collections(id),
			relation_type        VARCHAR(15) NOT NULL,
			junction_table       VARCHAR(63),
			on_delete            VARCHAR(15) NOT NULL DEFAULT 'SET NULL'
		)`,

		// --- _meta.processes ---
		`CREATE TABLE IF NOT EXISTS _meta.processes (
			id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			collection_id   UUID UNIQUE NOT NULL REFERENCES _meta.collections(id) ON DELETE CASCADE,
			is_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,

		// --- _meta.process_statuses ---
		`CREATE TABLE IF NOT EXISTS _meta.process_statuses (
			id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			process_id  UUID NOT NULL REFERENCES _meta.processes(id) ON DELETE CASCADE,
			name        VARCHAR(255) NOT NULL,
			color       VARCHAR(31) NOT NULL DEFAULT '#6b7280',
			sort_order  INTEGER NOT NULL DEFAULT 0,
			is_initial  BOOLEAN NOT NULL DEFAULT FALSE,
			created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,

		// --- _meta.process_transitions ---
		`CREATE TABLE IF NOT EXISTS _meta.process_transitions (
			id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			process_id      UUID NOT NULL REFERENCES _meta.processes(id) ON DELETE CASCADE,
			from_status_id  UUID NOT NULL REFERENCES _meta.process_statuses(id) ON DELETE CASCADE,
			to_status_id    UUID NOT NULL REFERENCES _meta.process_statuses(id) ON DELETE CASCADE,
			label           VARCHAR(255) NOT NULL,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,

		// --- _meta.views ---
		`CREATE TABLE IF NOT EXISTS _meta.views (
			id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			collection_id   UUID NOT NULL REFERENCES _meta.collections(id) ON DELETE CASCADE,
			name            VARCHAR(255) NOT NULL,
			view_type       VARCHAR(31) NOT NULL DEFAULT 'list',
			config          JSONB DEFAULT '{}',
			sort_order      INTEGER NOT NULL DEFAULT 0,
			is_default      BOOLEAN NOT NULL DEFAULT FALSE,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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
