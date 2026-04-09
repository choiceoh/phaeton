// Package engine implements the topsolar dynamic data layer.
//
// It sits on top of the schema package (collections + fields metadata)
// and the data.{slug} physical tables managed by the migration package.
// Its six public methods — CreateEntry, QueryEntries, GetEntry,
// UpdateEntry, DeleteEntry, and AggregateEntries — are the only
// sanctioned CRUD entry points for dynamic rows.
//
// Every public call goes through the engine-local schemaCache so that
// the hot path never touches _meta.collections / _meta.fields more than
// once per collection. The cache is invalidated by the migration
// engine via InvalidateSchema(collectionID).
package engine

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/schema"
)

// Engine is the single public type in this package. Construct it once
// per process via New and share it across goroutines.
type Engine struct {
	pool  *pgxpool.Pool
	cache *schemaCache
}

// New wires an Engine around an existing pgx pool.
//
// The provided schema.Cache is used as the source of truth for
// collection and field metadata. Every call to engine.loadSchema hits
// schema.Cache (not the database) which keeps schema lookups cheap.
// The engine additionally maintains a denormalized AppSchema snapshot
// per collection so that hot paths don't rebuild index maps on every
// request.
func New(pool *pgxpool.Pool, meta *schema.Cache) *Engine {
	e := &Engine{pool: pool}
	e.cache = newSchemaCache(func(ctx context.Context, collectionID string) (*AppSchema, error) {
		return loadFromMeta(meta, collectionID)
	})
	return e
}

// Pool exposes the underlying pgx pool. Reserved for test harnesses
// and the migration package; production code paths must go through the
// CRUD methods instead.
func (e *Engine) Pool() *pgxpool.Pool { return e.pool }

// InvalidateSchema drops the cached snapshot for a single collection.
// It is safe to call for an unknown id (no-op).
//
// The migration engine calls this after every committed schema change
// so that the next CRUD call re-reads the definition. Callers that
// mutate _meta.* by hand are responsible for invoking it themselves.
func (e *Engine) InvalidateSchema(collectionID string) {
	e.cache.InvalidateSchema(collectionID)
}

// InvalidateAll drops every cached entry. Intended for wholesale
// schema reloads (for example, after restoring from a backup).
func (e *Engine) InvalidateAll() { e.cache.InvalidateAll() }

// AppSchema is the engine-local snapshot used by the data path. It
// mirrors schema.Collection but pre-builds lookup maps so CreateEntry
// and friends don't linear-scan the field slice on every request.
//
// AppSchema values are immutable once stored in the cache. Mutating a
// field through the ByName / ByColumn pointers would race with other
// readers; always treat it as read-only.
type AppSchema struct {
	ID        string
	Slug      string
	Fields    []schema.Field
	ByName    map[string]*schema.Field // slug → field
	ByColumn  map[string]*schema.Field // column_name → field (same as slug today)
	Required  map[string]bool          // slug → true if required
}

// knownColumns returns the set of physical columns that may appear in
// a filter, sort, or select clause. It always includes id,
// created_at, updated_at, and deleted_at plus every field slug.
func (s *AppSchema) knownColumns() map[string]struct{} {
	out := map[string]struct{}{
		"id":         {},
		"created_at": {},
		"updated_at": {},
		"created_by": {},
		"deleted_at": {},
	}
	for i := range s.Fields {
		out[s.Fields[i].Slug] = struct{}{}
	}
	return out
}

// selectCols is the column list used by SELECT / RETURNING statements.
// It is rebuilt on every call rather than memoized; the cost is tiny
// and the schema snapshot is already cached.
func (s *AppSchema) selectCols() string {
	parts := make([]string, 0, len(s.Fields)+5)
	parts = append(parts, quoteIdent("id"))
	for i := range s.Fields {
		parts = append(parts, quoteIdent(s.Fields[i].Slug))
	}
	parts = append(parts,
		quoteIdent("created_at"),
		quoteIdent("updated_at"),
		quoteIdent("created_by"),
		quoteIdent("deleted_at"),
	)
	return joinComma(parts)
}

// qualifiedTable returns the safely quoted "data"."<slug>" identifier.
func (s *AppSchema) qualifiedTable() string {
	return quoteIdent("data") + "." + quoteIdent(s.Slug)
}

// loadFromMeta converts a schema.Collection (loaded by the upstream
// schema.Cache) into the denormalized AppSchema the engine caches. It
// does not hit the database directly; if the collection is missing
// from the cache we return ErrNotFound.
func loadFromMeta(meta *schema.Cache, collectionID string) (*AppSchema, error) {
	col, ok := meta.CollectionByID(collectionID)
	if !ok {
		return nil, fmt.Errorf("%w: collection %s", ErrNotFound, collectionID)
	}
	fields := meta.Fields(collectionID)

	snap := &AppSchema{
		ID:       col.ID,
		Slug:     col.Slug,
		Fields:   fields,
		ByName:   make(map[string]*schema.Field, len(fields)),
		ByColumn: make(map[string]*schema.Field, len(fields)),
		Required: make(map[string]bool, len(fields)),
	}
	// Index by pointer into the local slice — taking &fields[i] is
	// stable because loadFromMeta is called once per cache miss and
	// the resulting AppSchema is immutable.
	for i := range snap.Fields {
		f := &snap.Fields[i]
		snap.ByName[f.Slug] = f
		snap.ByColumn[f.Slug] = f
		if f.IsRequired {
			snap.Required[f.Slug] = true
		}
	}
	return snap, nil
}

// Sentinel errors exposed to callers.
var (
	// ErrNotFound is returned by GetEntry / UpdateEntry / DeleteEntry
	// when the target row (or collection) cannot be located.
	ErrNotFound = errors.New("engine: not found")

	// ErrInvalidInput wraps structural problems with the caller's
	// payload (unknown field, wrong type, missing required value).
	ErrInvalidInput = errors.New("engine: invalid input")
)

// wrapPgErr translates pgx row-not-found into the package sentinel.
// Any other error is passed through unchanged.
func wrapPgErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// ValidationError is produced by validation.go. It implements the
// error interface and wraps ErrInvalidInput for errors.Is checks.
type ValidationError struct {
	Field   string
	Message string
}

func (v *ValidationError) Error() string {
	if v.Field == "" {
		return fmt.Sprintf("engine: invalid input: %s", v.Message)
	}
	return fmt.Sprintf("engine: invalid input: %s: %s", v.Field, v.Message)
}

// Unwrap lets errors.Is(err, engine.ErrInvalidInput) succeed for any
// validation error, regardless of which field triggered it.
func (v *ValidationError) Unwrap() error { return ErrInvalidInput }
