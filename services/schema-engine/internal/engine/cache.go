package engine

import (
	"context"
	"sync"

	"golang.org/x/sync/singleflight"
)

// schemaCache is a process-wide snapshot store keyed by collection id.
// Lookups go through singleflight so a cold start does not fan out the
// loader across every in-flight request. Once a snapshot is installed,
// subsequent reads are lock-free via sync.Map.
//
// The cache is deliberately write-through-on-miss only — it never
// refreshes an existing entry on its own. The migration engine is the
// single source of invalidation signals and must call InvalidateSchema
// (or InvalidateAll) after every committed schema change.
type schemaCache struct {
	entries sync.Map // collectionID (string) → *AppSchema
	loader  schemaLoader
	single  singleflight.Group
}

// schemaLoader is the callback used on cache miss. Engine supplies a
// closure that reads from the upstream schema.Cache so this package
// does not need a direct import of the migration engine.
type schemaLoader func(ctx context.Context, collectionID string) (*AppSchema, error)

func newSchemaCache(loader schemaLoader) *schemaCache {
	return &schemaCache{loader: loader}
}

// get returns the AppSchema snapshot for collectionID, loading it on
// first miss. Concurrent misses on the same id collapse into one
// loader call via singleflight.
func (c *schemaCache) get(ctx context.Context, collectionID string) (*AppSchema, error) {
	if v, ok := c.entries.Load(collectionID); ok {
		return v.(*AppSchema), nil
	}
	// singleflight.Do guarantees that only one goroutine per key is
	// inside the function at a time. Everybody else blocks on the
	// same result, so N concurrent misses produce one loader call.
	v, err, _ := c.single.Do(collectionID, func() (any, error) {
		// Re-check after acquiring the flight slot. If another
		// goroutine populated the entry while we were queueing up,
		// reuse it instead of loading again.
		if v, ok := c.entries.Load(collectionID); ok {
			return v, nil
		}
		snap, err := c.loader(ctx, collectionID)
		if err != nil {
			return nil, err
		}
		c.entries.Store(collectionID, snap)
		return snap, nil
	})
	if err != nil {
		return nil, err
	}
	return v.(*AppSchema), nil
}

// InvalidateSchema removes a single entry. Safe to call concurrently.
// Does nothing if collectionID is not cached — the next get will hit
// the loader.
func (c *schemaCache) InvalidateSchema(collectionID string) {
	c.entries.Delete(collectionID)
	// Forget any in-flight load too; if one is racing with this
	// delete we prefer the re-read to use the fresh metadata.
	c.single.Forget(collectionID)
}

// InvalidateAll drops every entry. Intended for wholesale reloads
// (bootstrap, test teardown, backup restore).
func (c *schemaCache) InvalidateAll() {
	c.entries.Range(func(k, _ any) bool {
		c.entries.Delete(k)
		if s, ok := k.(string); ok {
			c.single.Forget(s)
		}
		return true
	})
}

// loadSchema is the engine-facing entry point used by data.go.
// It's a thin pass-through to schemaCache.get — kept as a named method
// on Engine so tests and callers have a stable symbol to mock.
func (e *Engine) loadSchema(ctx context.Context, collectionID string) (*AppSchema, error) {
	return e.cache.get(ctx, collectionID)
}
