package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// metaMigration is one step in the engine's own internal schema evolution.
// These run in order on every startup; each step records its version once
// applied so subsequent boots skip it.
//
// IMPORTANT: append-only. Never edit a previous step's SQL after it has shipped —
// instead, add a new step that performs the corrective change.
type metaMigration struct {
	version int
	name    string
	stmts   []string
}

var metaMigrations = []metaMigration{
	{
		version: 1,
		name:    "initial schemas + meta tables",
		stmts: []string{
			`CREATE SCHEMA IF NOT EXISTS _meta`,
			`CREATE SCHEMA IF NOT EXISTS _history`,
			`CREATE SCHEMA IF NOT EXISTS data`,

			`CREATE TABLE IF NOT EXISTS _meta.schema_version (
				version    INTEGER PRIMARY KEY,
				name       TEXT NOT NULL,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`,

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

			`CREATE TABLE IF NOT EXISTS _meta.relations (
				id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				field_id             UUID UNIQUE NOT NULL REFERENCES _meta.fields(id) ON DELETE CASCADE,
				target_collection_id UUID NOT NULL REFERENCES _meta.collections(id),
				relation_type        VARCHAR(15) NOT NULL,
				junction_table       VARCHAR(63),
				on_delete            VARCHAR(15) NOT NULL DEFAULT 'SET NULL'
			)`,

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
		},
	},
	// Future steps go here. Example:
	// {
	//     version: 2,
	//     name:    "add column X to _meta.fields",
	//     stmts:   []string{`ALTER TABLE _meta.fields ADD COLUMN X TEXT`},
	// },
}

// Bootstrap applies any pending meta-schema migrations.
// It is safe to call on every startup; previously applied versions are skipped.
func Bootstrap(ctx context.Context, pool *pgxpool.Pool) error {
	// Step 0: ensure the _meta schema and schema_version table exist so we can
	// query the current version. We use a separate transaction so the version
	// table itself is committed before we try to read from it.
	if err := ensureVersionTable(ctx, pool); err != nil {
		return err
	}

	current, err := currentVersion(ctx, pool)
	if err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}

	for _, mig := range metaMigrations {
		if mig.version <= current {
			continue
		}
		if err := applyMetaMigration(ctx, pool, mig); err != nil {
			return fmt.Errorf("apply meta migration v%d (%s): %w", mig.version, mig.name, err)
		}
	}
	return nil
}

func ensureVersionTable(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin ensure-version: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `CREATE SCHEMA IF NOT EXISTS _meta`); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS _meta.schema_version (
		version    INTEGER PRIMARY KEY,
		name       TEXT NOT NULL,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func currentVersion(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	var v int
	err := pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(version), 0) FROM _meta.schema_version`).Scan(&v)
	return v, err
}

func applyMetaMigration(ctx context.Context, pool *pgxpool.Pool, mig metaMigration) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, stmt := range mig.stmts {
		if _, err := tx.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("stmt: %w", err)
		}
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO _meta.schema_version (version, name) VALUES ($1, $2)
		 ON CONFLICT (version) DO NOTHING`,
		mig.version, mig.name)
	if err != nil {
		return fmt.Errorf("record version: %w", err)
	}
	return tx.Commit(ctx)
}
