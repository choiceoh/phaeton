package schema

import (
	"context"
	"fmt"
	"sync"
)

// Cache holds an in-memory snapshot of _meta tables.
// It is safe for concurrent reads and invalidated on schema changes.
type Cache struct {
	mu    sync.RWMutex
	store *Store

	collections []Collection            // ordered list
	byID        map[string]*Collection  // collection ID → *Collection
	bySlug      map[string]*Collection  // collection slug → *Collection
	fieldsByCol map[string][]Field      // collection ID → fields
}

func NewCache(store *Store) *Cache {
	return &Cache{
		store:       store,
		byID:        make(map[string]*Collection),
		bySlug:      make(map[string]*Collection),
		fieldsByCol: make(map[string][]Field),
	}
}

// Load reads the full meta state from PostgreSQL.
// Called once on startup and after every schema change.
func (c *Cache) Load(ctx context.Context) error {
	collections, err := c.store.ListCollections(ctx)
	if err != nil {
		return fmt.Errorf("cache load collections: %w", err)
	}

	byID := make(map[string]*Collection, len(collections))
	bySlug := make(map[string]*Collection, len(collections))
	fieldsByCol := make(map[string][]Field, len(collections))

	for i := range collections {
		fields, err := c.store.ListFields(ctx, collections[i].ID)
		if err != nil {
			return fmt.Errorf("cache load fields for %s: %w", collections[i].Slug, err)
		}
		collections[i].Fields = fields
		byID[collections[i].ID] = &collections[i]
		bySlug[collections[i].Slug] = &collections[i]
		fieldsByCol[collections[i].ID] = fields
	}

	c.mu.Lock()
	c.collections = collections
	c.byID = byID
	c.bySlug = bySlug
	c.fieldsByCol = fieldsByCol
	c.mu.Unlock()

	return nil
}

// Invalidate clears and reloads from the database.
func (c *Cache) Invalidate(ctx context.Context) error {
	return c.Load(ctx)
}

// Collections returns all collections (snapshot).
func (c *Cache) Collections() []Collection {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]Collection, len(c.collections))
	copy(out, c.collections)
	return out
}

// CollectionByID returns a collection by its UUID.
func (c *Cache) CollectionByID(id string) (Collection, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	col, ok := c.byID[id]
	if !ok {
		return Collection{}, false
	}
	return *col, true
}

// CollectionBySlug returns a collection by its slug.
func (c *Cache) CollectionBySlug(slug string) (Collection, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	col, ok := c.bySlug[slug]
	if !ok {
		return Collection{}, false
	}
	return *col, true
}

// Fields returns the field list for a collection.
func (c *Cache) Fields(collectionID string) []Field {
	c.mu.RLock()
	defer c.mu.RUnlock()
	src := c.fieldsByCol[collectionID]
	out := make([]Field, len(src))
	copy(out, src)
	return out
}
