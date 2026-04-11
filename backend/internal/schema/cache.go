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
	mu        sync.RWMutex
	store     *Store
	byID      map[string]Collection
	bySlug    map[string]Collection
	processes map[string]Process // keyed by collection_id

	// Workbook model.
	workbooks   map[string]Workbook          // id → Workbook
	folders     map[string]Folder            // id → Folder
	colToWB     map[string]string            // collection_id → workbook_id
	reverseRels map[string][]ReverseRelField // target_collection_id → source fields
}

func NewCache(store *Store) *Cache {
	return &Cache{
		store:       store,
		byID:        make(map[string]Collection),
		bySlug:      make(map[string]Collection),
		processes:   make(map[string]Process),
		workbooks:   make(map[string]Workbook),
		folders:     make(map[string]Folder),
		colToWB:     make(map[string]string),
		reverseRels: make(map[string][]ReverseRelField),
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

	// Load process configs for all collections.
	procs := make(map[string]Process, len(collections))
	for _, col := range collections {
		proc, err := c.store.GetProcess(ctx, col.ID)
		if err != nil {
			return fmt.Errorf("cache load process for %s: %w", col.Slug, err)
		}
		if proc.ID != "" {
			procs[col.ID] = proc
		}
	}

	// Load folders.
	folderList, err := c.store.ListFolders(ctx)
	if err != nil {
		return fmt.Errorf("cache load folders: %w", err)
	}
	foldersMap := make(map[string]Folder, len(folderList))
	for _, f := range folderList {
		foldersMap[f.ID] = f
	}

	// Load workbooks.
	wbList, err := c.store.ListWorkbooks(ctx)
	if err != nil {
		return fmt.Errorf("cache load workbooks: %w", err)
	}
	wbMap := make(map[string]Workbook, len(wbList))
	for _, wb := range wbList {
		wbMap[wb.ID] = wb
	}

	// Build collection → workbook index.
	colToWB := make(map[string]string, len(collections))
	for _, col := range collections {
		if col.WorkbookID != "" {
			colToWB[col.ID] = col.WorkbookID
		}
	}

	// Build reverse relations index.
	reverseRels := buildReverseRels(byID)

	c.mu.Lock()
	c.byID = byID
	c.bySlug = bySlug
	c.processes = procs
	c.folders = foldersMap
	c.workbooks = wbMap
	c.colToWB = colToWB
	c.reverseRels = reverseRels
	c.mu.Unlock()
	return nil
}

// Invalidate is an alias for Load — kept for backward compatibility with call sites
// that want "refresh everything". Prefer ReloadCollection / RemoveCollection when
// you know the exact change.
func (c *Cache) Invalidate(ctx context.Context) error {
	return c.Load(ctx)
}

// ReloadCollection fetches a single collection (plus its fields and relations) from
// the database and updates both the byID and bySlug maps in the cache.
// If the collection's slug changed, the stale slug mapping is removed first.
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

	// Update workbook index.
	if col.WorkbookID != "" {
		c.colToWB[id] = col.WorkbookID
	} else {
		delete(c.colToWB, id)
	}

	// Rebuild reverse relations (cheap for 300-user scale).
	c.reverseRels = buildReverseRels(c.byID)
	return nil
}

// RemoveCollection deletes a single collection from both the byID and bySlug maps.
// Used after DropCollection. Safe to call with an ID that is not in the cache.
func (c *Cache) RemoveCollection(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	col, ok := c.byID[id]
	if !ok {
		return
	}
	delete(c.byID, id)
	delete(c.bySlug, col.Slug)
	delete(c.colToWB, id)
	c.reverseRels = buildReverseRels(c.byID)
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

// CollectionByID returns a collection by its UUID, along with a boolean indicating
// whether the collection was found. The returned Collection is a value copy —
// mutating it does not affect the cache.
func (c *Cache) CollectionByID(id string) (Collection, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	col, ok := c.byID[id]
	return col, ok
}

// CollectionBySlug returns a collection by its slug (e.g. "permit_checklist").
// The returned Collection is a value copy.
func (c *Cache) CollectionBySlug(slug string) (Collection, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	col, ok := c.bySlug[slug]
	return col, ok
}

// CollectionByFieldID returns the collection that owns the given field.
func (c *Cache) CollectionByFieldID(fieldID string) (Collection, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, col := range c.byID {
		for _, f := range col.Fields {
			if f.ID == fieldID {
				return col, true
			}
		}
	}
	return Collection{}, false
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

// ProcessByCollectionID returns the process config (워크플로우 설정) for a collection.
// Returns false if the collection has no process configured or process is not enabled.
func (c *Cache) ProcessByCollectionID(collectionID string) (Process, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	p, ok := c.processes[collectionID]
	return p, ok
}

// ReloadProcess fetches the process config for a single collection from the DB
// and updates the cache. If the collection has no process (empty ID), the entry
// is removed from the cache instead.
func (c *Cache) ReloadProcess(ctx context.Context, collectionID string) error {
	proc, err := c.store.GetProcess(ctx, collectionID)
	if err != nil {
		return fmt.Errorf("reload process %s: %w", collectionID, err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if proc.ID != "" {
		c.processes[collectionID] = proc
	} else {
		delete(c.processes, collectionID)
	}
	return nil
}

// RemoveProcess deletes a process entry from the cache by collection ID.
func (c *Cache) RemoveProcess(collectionID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.processes, collectionID)
}

// ---------- Workbook / Folder cache methods ----------

// WorkbookByID returns a workbook by UUID. The returned Workbook has no Sheets populated.
func (c *Cache) WorkbookByID(id string) (Workbook, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	wb, ok := c.workbooks[id]
	return wb, ok
}

// SheetsInWorkbook returns all collections belonging to the given workbook.
func (c *Cache) SheetsInWorkbook(workbookID string) []Collection {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var out []Collection
	for _, col := range c.byID {
		if col.WorkbookID == workbookID {
			out = append(out, col)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].Label < out[j].Label
	})
	return out
}

// WorkbookForCollection returns the workbook ID for a given collection.
func (c *Cache) WorkbookForCollection(collectionID string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	wb, ok := c.colToWB[collectionID]
	return wb, ok
}

// SiblingSheets returns all other collections in the same workbook.
func (c *Cache) SiblingSheets(collectionID string) []Collection {
	c.mu.RLock()
	wbID := c.colToWB[collectionID]
	c.mu.RUnlock()
	if wbID == "" {
		return nil
	}
	sheets := c.SheetsInWorkbook(wbID)
	out := make([]Collection, 0, len(sheets)-1)
	for _, s := range sheets {
		if s.ID != collectionID {
			out = append(out, s)
		}
	}
	return out
}

// ReverseRelations returns virtual field descriptors for all collections that
// have a relation field pointing TO the given collection.
func (c *Cache) ReverseRelations(collectionID string) []ReverseRelField {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := c.reverseRels[collectionID]
	if out == nil {
		return nil
	}
	cp := make([]ReverseRelField, len(out))
	copy(cp, out)
	return cp
}

// Folders returns all folders sorted by sort_order then label.
func (c *Cache) Folders() []Folder {
	c.mu.RLock()
	out := make([]Folder, 0, len(c.folders))
	for _, f := range c.folders {
		out = append(out, f)
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

// Workbooks returns all workbooks sorted by sort_order then label.
func (c *Cache) Workbooks() []Workbook {
	c.mu.RLock()
	out := make([]Workbook, 0, len(c.workbooks))
	for _, wb := range c.workbooks {
		out = append(out, wb)
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

// ReloadWorkbook fetches a single workbook from the DB and updates the cache.
func (c *Cache) ReloadWorkbook(ctx context.Context, id string) error {
	wb, err := c.store.getWorkbook(ctx, id)
	if err != nil {
		return fmt.Errorf("reload workbook %s: %w", id, err)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.workbooks[id] = wb
	return nil
}

// RemoveWorkbook removes a workbook from the cache. Also cleans up colToWB references.
func (c *Cache) RemoveWorkbook(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.workbooks[id]; !ok {
		return
	}
	delete(c.workbooks, id)
	for colID, wbID := range c.colToWB {
		if wbID == id {
			delete(c.colToWB, colID)
		}
	}
}

// ReloadFolders refreshes all folders in the cache.
func (c *Cache) ReloadFolders(ctx context.Context) error {
	list, err := c.store.ListFolders(ctx)
	if err != nil {
		return fmt.Errorf("reload folders: %w", err)
	}
	m := make(map[string]Folder, len(list))
	for _, f := range list {
		m[f.ID] = f
	}
	c.mu.Lock()
	c.folders = m
	c.mu.Unlock()
	return nil
}

// ---------- internal helpers ----------

// buildReverseRels scans all collections and builds a reverse-relation index.
func buildReverseRels(byID map[string]Collection) map[string][]ReverseRelField {
	rev := make(map[string][]ReverseRelField)
	for _, col := range byID {
		for _, f := range col.Fields {
			if f.FieldType != FieldRelation || f.Relation == nil {
				continue
			}
			targetID := f.Relation.TargetCollectionID
			rev[targetID] = append(rev[targetID], ReverseRelField{
				SourceCollectionID:    col.ID,
				SourceCollectionSlug:  col.Slug,
				SourceCollectionLabel: col.Label,
				SourceFieldSlug:       f.Slug,
				SourceFieldLabel:      f.Label,
				RelationType:          f.Relation.RelationType,
				JunctionTable:         f.Relation.JunctionTable,
			})
		}
	}
	return rev
}
