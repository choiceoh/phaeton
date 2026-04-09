package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/database"
	"github.com/choiceoh/phaeton/services/schema-engine/internal/migration"
	"github.com/choiceoh/phaeton/services/schema-engine/internal/schema"
)

// ---------------------------------------------------------------------
// Integration test harness
// ---------------------------------------------------------------------
//
// These tests hit a real PostgreSQL. Set TEST_DATABASE_URL to run
// them; the package-level skip below silently opts out when the env
// var is missing so unit-test runs stay green in environments without
// a database (CI unit stage, ephemeral dev boxes).
//
//   export TEST_DATABASE_URL='postgres://user:pass@localhost:5432/topsolar_test?sslmode=disable'
//   go test ./internal/engine/...
//
// Every test creates its own throwaway collection (slug = test_<n>)
// so parallel runs don't collide. Cleanup runs in t.Cleanup to
// guarantee ordering even when the test fails mid-way.

type testFixture struct {
	pool *pgxpool.Pool
	mig  *migration.Engine
	eng  *Engine
	col  schema.Collection
}

// newFixture spins up a fresh collection with one field of every
// interesting type, returns a fixture, and registers the teardown.
// Subtests should never share a fixture: the data.<slug> table is
// dropped in cleanup.
func newFixture(t *testing.T) *testFixture {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := database.NewPool(ctx, url)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	if err := database.Bootstrap(ctx, pool); err != nil {
		pool.Close()
		t.Fatalf("bootstrap: %v", err)
	}

	store := schema.NewStore(pool)
	cache := schema.NewCache(store)
	if err := cache.Load(ctx); err != nil {
		pool.Close()
		t.Fatalf("cache load: %v", err)
	}

	mig := migration.NewEngine(pool, store, cache)
	eng := New(pool, cache)
	mig.OnSchemaChanged = eng.InvalidateSchema

	// Slug must match ^[a-z][a-z0-9_]{0,62}$ and stay unique per
	// parallel run. sanitizeSlug turns the test name into a valid
	// identifier (e.g. "TestCreateEntry_AllTypes" → "test_all_types").
	slug := sanitizeSlug(t.Name())
	choicesJSON, _ := json.Marshal(map[string]any{
		"choices": []string{"low", "mid", "high"},
	})

	col, err := mig.CreateCollection(ctx, &schema.CreateCollectionReq{
		Slug:  slug,
		Label: t.Name(),
		Fields: []schema.CreateFieldIn{
			{Slug: "title", Label: "Title", FieldType: schema.FieldText, IsRequired: true},
			{Slug: "amount", Label: "Amount", FieldType: schema.FieldNumber},
			{Slug: "qty", Label: "Qty", FieldType: schema.FieldInteger},
			{Slug: "is_done", Label: "Done", FieldType: schema.FieldBoolean},
			{Slug: "due_date", Label: "Due", FieldType: schema.FieldDate},
			{Slug: "deadline", Label: "Deadline", FieldType: schema.FieldDatetime},
			{Slug: "priority", Label: "Priority", FieldType: schema.FieldSelect, Options: choicesJSON},
			{Slug: "payload", Label: "Payload", FieldType: schema.FieldJSON},
		},
	})
	if err != nil {
		pool.Close()
		t.Fatalf("create collection: %v", err)
	}

	t.Cleanup(func() {
		if err := mig.DropCollection(ctx, col.ID); err != nil {
			t.Logf("teardown drop collection: %v", err)
		}
		pool.Close()
	})

	return &testFixture{pool: pool, mig: mig, eng: eng, col: col}
}

// sanitizeSlug converts a Go test function name into the lowercase
// snake_case slug the schema validator requires.
func sanitizeSlug(name string) string {
	var b strings.Builder
	b.WriteString("t_") // always starts with a letter
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		default:
			b.WriteRune('_')
		}
	}
	s := b.String()
	if len(s) > 63 {
		s = s[:63]
	}
	return s
}

// ---------------------------------------------------------------------
// 1. CreateEntry — happy path across every field type
// ---------------------------------------------------------------------

func TestCreateEntry_AllTypes(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	body := map[string]any{
		"title":    "신청",
		"amount":   1234.5,
		"qty":      7.0, // JSON numbers decode to float64
		"is_done":  false,
		"due_date": "2026-05-01",
		"deadline": "2026-05-01T09:00:00Z",
		"priority": "high",
		"payload":  map[string]any{"note": "예약"},
	}
	entry, err := f.eng.CreateEntry(ctx, f.col.ID, body)
	if err != nil {
		t.Fatalf("CreateEntry: %v", err)
	}
	if entry["title"] != "신청" {
		t.Errorf("title: got %v", entry["title"])
	}
	if entry["priority"] != "high" {
		t.Errorf("priority: got %v", entry["priority"])
	}
	if _, ok := entry["id"].(string); !ok {
		t.Errorf("id missing or wrong type: %T", entry["id"])
	}
	if _, ok := entry["created_at"].(time.Time); !ok {
		t.Errorf("created_at missing or wrong type: %T", entry["created_at"])
	}
}

// ---------------------------------------------------------------------
// 2. CreateEntry — missing required field is rejected
// ---------------------------------------------------------------------

func TestCreateEntry_MissingRequired(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	_, err := f.eng.CreateEntry(ctx, f.col.ID, map[string]any{"amount": 10.0})
	if err == nil {
		t.Fatalf("expected validation error")
	}
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != "title" {
		t.Errorf("expected ValidationError on title, got %v", err)
	}
	if !errors.Is(err, ErrInvalidInput) {
		t.Errorf("expected ErrInvalidInput chain, got %v", err)
	}
}

// ---------------------------------------------------------------------
// 3. CreateEntry — unknown field is rejected
// ---------------------------------------------------------------------

func TestCreateEntry_UnknownField(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	_, err := f.eng.CreateEntry(ctx, f.col.ID, map[string]any{
		"title":      "ok",
		"nonsense":   "nope",
	})
	if err == nil {
		t.Fatalf("expected validation error")
	}
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != "nonsense" {
		t.Errorf("expected ValidationError on nonsense, got %v", err)
	}
}

// ---------------------------------------------------------------------
// 4. CreateEntry — select value outside choices list
// ---------------------------------------------------------------------

func TestCreateEntry_InvalidSelectChoice(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	_, err := f.eng.CreateEntry(ctx, f.col.ID, map[string]any{
		"title":    "ok",
		"priority": "urgent", // not in {low, mid, high}
	})
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != "priority" {
		t.Fatalf("expected ValidationError on priority, got %v", err)
	}
}

// ---------------------------------------------------------------------
// 5. GetEntry — round-trip after insert, and not-found for random id
// ---------------------------------------------------------------------

func TestGetEntry_RoundTripAndNotFound(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	created, err := f.eng.CreateEntry(ctx, f.col.ID, map[string]any{"title": "hello"})
	if err != nil {
		t.Fatalf("CreateEntry: %v", err)
	}
	id := created["id"].(string)

	got, err := f.eng.GetEntry(ctx, f.col.ID, id)
	if err != nil {
		t.Fatalf("GetEntry: %v", err)
	}
	if got["title"] != "hello" {
		t.Errorf("title: got %v", got["title"])
	}

	_, err = f.eng.GetEntry(ctx, f.col.ID, "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// ---------------------------------------------------------------------
// 6. UpdateEntry — partial patch leaves untouched fields alone
// ---------------------------------------------------------------------

func TestUpdateEntry_PartialPatch(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	created, err := f.eng.CreateEntry(ctx, f.col.ID, map[string]any{
		"title":    "draft",
		"priority": "low",
	})
	if err != nil {
		t.Fatalf("CreateEntry: %v", err)
	}
	id := created["id"].(string)

	updated, err := f.eng.UpdateEntry(ctx, f.col.ID, id, map[string]any{"priority": "high"})
	if err != nil {
		t.Fatalf("UpdateEntry: %v", err)
	}
	if updated["title"] != "draft" {
		t.Errorf("title should be unchanged, got %v", updated["title"])
	}
	if updated["priority"] != "high" {
		t.Errorf("priority: got %v", updated["priority"])
	}
	// updated_at must have moved forward. We allow a zero
	// tolerance since PostgreSQL now() at statement boundary is
	// deterministic relative to the insert.
	ca := created["updated_at"].(time.Time)
	ua := updated["updated_at"].(time.Time)
	if !ua.After(ca) && !ua.Equal(ca) {
		t.Errorf("updated_at should advance: created=%v updated=%v", ca, ua)
	}
}

// ---------------------------------------------------------------------
// 7. DeleteEntry — soft delete hides the row from subsequent reads
// ---------------------------------------------------------------------

func TestDeleteEntry_SoftDelete(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	created, err := f.eng.CreateEntry(ctx, f.col.ID, map[string]any{"title": "doomed"})
	if err != nil {
		t.Fatalf("CreateEntry: %v", err)
	}
	id := created["id"].(string)

	if err := f.eng.DeleteEntry(ctx, f.col.ID, id); err != nil {
		t.Fatalf("DeleteEntry: %v", err)
	}
	if _, err := f.eng.GetEntry(ctx, f.col.ID, id); !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
	// Double delete should also 404 — the first one flipped
	// deleted_at so the WHERE clause no longer matches.
	if err := f.eng.DeleteEntry(ctx, f.col.ID, id); !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound on second delete, got %v", err)
	}
}

// ---------------------------------------------------------------------
// 8. QueryEntries — filter + pagination on a populated collection
// ---------------------------------------------------------------------

func TestQueryEntries_FilterAndPagination(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	// Seed 25 rows: 10 "high", 15 "low".
	for i := range 25 {
		priority := "low"
		if i%5 == 0 {
			priority = "high"
		}
		_, err := f.eng.CreateEntry(ctx, f.col.ID, map[string]any{
			"title":    fmt.Sprintf("row-%02d", i),
			"priority": priority,
			"qty":      float64(i),
		})
		if err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	// Filter high priority and page-size 3.
	res, err := f.eng.QueryEntries(ctx, f.col.ID, QueryRequest{
		Filters: []Filter{{Field: "priority", Op: OpEq, Value: "high"}},
		Sort:    []SortSpec{{Field: "qty", Desc: false}},
		Limit:   3,
		Offset:  0,
	})
	if err != nil {
		t.Fatalf("QueryEntries: %v", err)
	}
	if res.Total != 5 {
		t.Errorf("total: want 5, got %d", res.Total)
	}
	if len(res.Rows) != 3 {
		t.Errorf("page size: want 3, got %d", len(res.Rows))
	}
	// First row should be qty=0 (smallest "high").
	if q := res.Rows[0]["qty"]; q != int64(0) && q != float64(0) {
		t.Errorf("first qty: want 0, got %v (%T)", q, q)
	}
}

// ---------------------------------------------------------------------
// 9. AggregateEntries — count/sum grouped by select field
// ---------------------------------------------------------------------

func TestAggregateEntries_CountSumGroupBy(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	seeds := []struct {
		priority string
		amount   float64
	}{
		{"low", 100},
		{"low", 200},
		{"mid", 50},
		{"high", 400},
		{"high", 600},
	}
	for i, s := range seeds {
		if _, err := f.eng.CreateEntry(ctx, f.col.ID, map[string]any{
			"title":    fmt.Sprintf("s-%d", i),
			"priority": s.priority,
			"amount":   s.amount,
		}); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	rows, err := f.eng.AggregateEntries(ctx, f.col.ID, AggregateSpec{
		Metrics: []AggMetric{
			{Op: "count", Alias: "n"},
			{Op: "sum", Field: "amount", Alias: "total"},
		},
		GroupBy: []string{"priority"},
	})
	if err != nil {
		t.Fatalf("AggregateEntries: %v", err)
	}
	// Expect one row per distinct priority.
	if len(rows) != 3 {
		t.Fatalf("want 3 rows, got %d", len(rows))
	}

	byPri := map[string]Entry{}
	for _, r := range rows {
		p, _ := r["priority"].(string)
		byPri[p] = r
	}
	if n := byPri["low"]["n"]; n != int64(2) {
		t.Errorf("low.n: want 2, got %v (%T)", n, n)
	}
	if total := byPri["high"]["total"]; total != float64(1000) {
		t.Errorf("high.total: want 1000, got %v (%T)", total, total)
	}
}
