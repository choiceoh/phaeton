package schema

import (
	"context"
	"fmt"
	"sort"
	"sync"
)

// Cache holds an in-memory snapshot of _meta tables.
// It supports both full reload (on startup) and partial per-collection updates
// (during normal schema changes) to avoid re-reading the entire meta table
// on every single DDL.
//
// Internally, collections are stored by value in two maps (id → Collection, slug → Collection).
// This avoids the pointer-stability issue that would arise if we stored them as
// slice elements and resized the slice.
type Cache struct {
	mu     sync.RWMutex
	store  *Store
	byID   map[string]Collection
	bySlug map[string]Collection
}

func NewCache(store *Store) *Cache {
	return &Cache{
		store:  store,
		byID:   make(map[string]Collection),
		bySlug: make(map[string]Collection),
	}
}

// Load reads the full meta state from PostgreSQL.
// Call this once on startup, or after an unknown change where partial updates
// are not tractable (e.g. rollback of an old migration).
func (c *Cache) Load(ctx context.Context) error {
	collections, err := c.store.ListCollections(ctx)
	if err != nil {
		return fmt.Errorf("cache load collections: %w", err)
	}

	byID := make(map[string]Collection, len(collections))
	bySlug := make(map[string]Collection, len(collections))

	for i := range collections {
		fields, err := c.store.ListFields(ctx, collections[i].ID)
		if err != nil {
			return fmt.Errorf("cache load fields for %s: %w", collections[i].Slug, err)
		}
		collections[i].Fields = fields
		byID[collections[i].ID] = collections[i]
		bySlug[collections[i].Slug] = collections[i]
	}

	c.mu.Lock()
	c.byID = byID
	c.bySlug = bySlug
	c.mu.Unlock()
	return nil
}

// Invalidate is an alias for Load — kept for backward compatibility with call sites
// that want "refresh everything". Prefer ReloadCollection / RemoveCollection when
// you know the exact change.
func (c *Cache) Invalidate(ctx context.Context) error {
	return c.Load(ctx)
}

// ReloadCollection refreshes a single collection (and its fields) from the DB.
// Used after CreateCollection, AddField, AlterField, DropField — any change that
// modifies exactly one collection.
func (c *Cache) ReloadCollection(ctx context.Context, id string) error {
	col, err := c.store.GetCollection(ctx, id)
	if err != nil {
		return fmt.Errorf("reload collection %s: %w", id, err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// If the slug changed (future-proofing), drop the stale slug mapping first.
	if old, ok := c.byID[id]; ok && old.Slug != col.Slug {
		delete(c.bySlug, old.Slug)
	}
	c.byID[id] = col
	c.bySlug[col.Slug] = col
	return nil
}

// RemoveCollection deletes a single collection from the cache.
// Used after DropCollection.
func (c *Cache) RemoveCollection(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	col, ok := c.byID[id]
	if !ok {
		return
	}
	delete(c.byID, id)
	delete(c.bySlug, col.Slug)
}

// Collections returns all collections sorted by sort_order then label.
// The returned slice is a fresh copy and safe for the caller to mutate.
func (c *Cache) Collections() []Collection {
	c.mu.RLock()
	out := make([]Collection, 0, len(c.byID))
	for _, col := range c.byID {
		out = append(out, col)
	}
	c.mu.RUnlock()

	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Label < out[j].Label
	})
	return out
}

// CollectionByID returns a collection by its UUID.
// The returned Collection is a copy — mutating it does not affect the cache.
func (c *Cache) CollectionByID(id string) (Collection, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	col, ok := c.byID[id]
	return col, ok
}

// CollectionBySlug returns a collection by its slug.
func (c *Cache) CollectionBySlug(slug string) (Collection, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	col, ok := c.bySlug[slug]
	return col, ok
}

// Fields returns the field list for a collection (empty slice if not found).
func (c *Cache) Fields(collectionID string) []Field {
	c.mu.RLock()
	defer c.mu.RUnlock()
	col, ok := c.byID[collectionID]
	if !ok {
		return nil
	}
	out := make([]Field, len(col.Fields))
	copy(out, col.Fields)
	return out
}
