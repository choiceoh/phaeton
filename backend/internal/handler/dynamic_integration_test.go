package handler_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/choiceoh/phaeton/backend/internal/testutil"
)

// TestDynamicCRUD walks the full Create → Get → List → Update → Delete cycle
// against a freshly-created collection. Verifies that the dynamic handler
// builds correct SQL against the auto-generated table.
func TestDynamicCRUD(t *testing.T) {
	env := testutil.NewEnv(t)
	testutil.SeedDirector(t, env.Pool)
	token := env.Login(t, testutil.DirectorEmail, testutil.DirectorPassword)

	// Set up a collection with two simple fields.
	createCol := map[string]any{
		"slug":  "tasks",
		"label": "Tasks",
		"fields": []map[string]any{
			{"slug": "title", "label": "Title", "field_type": "text", "is_required": true},
			{"slug": "priority", "label": "Priority", "field_type": "integer"},
		},
	}
	status, body := env.DoJSON(t, http.MethodPost, "/api/schema/collections", token, createCol)
	if status != http.StatusCreated {
		t.Fatalf("create collection: status %d, body %s", status, body)
	}

	// Create a record.
	status, body = env.DoJSON(t, http.MethodPost, "/api/data/tasks", token, map[string]any{
		"title":    "First task",
		"priority": 1,
	})
	if status != http.StatusCreated {
		t.Fatalf("create record: status %d, body %s", status, body)
	}

	var record struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	testutil.UnmarshalEnvelope(t, body, &record)
	if record.ID == "" {
		t.Fatal("created record id empty")
	}
	if record.Title != "First task" {
		t.Errorf("title = %q, want %q", record.Title, "First task")
	}

	// Get single record.
	status, body = env.DoJSON(t, http.MethodGet, "/api/data/tasks/"+record.ID, token, nil)
	if status != http.StatusOK {
		t.Fatalf("get record: status %d, body %s", status, body)
	}

	// List — list endpoint uses the listEnvelope, not the data envelope.
	status, body = env.DoJSON(t, http.MethodGet, "/api/data/tasks", token, nil)
	if status != http.StatusOK {
		t.Fatalf("list records: status %d, body %s", status, body)
	}
	var list struct {
		Data  []map[string]any `json:"data"`
		Total int64            `json:"total"`
	}
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if list.Total != 1 {
		t.Errorf("total = %d, want 1", list.Total)
	}
	if len(list.Data) != 1 {
		t.Fatalf("data length = %d, want 1", len(list.Data))
	}

	// Update.
	status, body = env.DoJSON(t, http.MethodPatch, "/api/data/tasks/"+record.ID, token, map[string]any{
		"title": "Renamed task",
	})
	if status != http.StatusOK {
		t.Fatalf("update record: status %d, body %s", status, body)
	}
	var updated struct {
		Title string `json:"title"`
	}
	testutil.UnmarshalEnvelope(t, body, &updated)
	if updated.Title != "Renamed task" {
		t.Errorf("updated title = %q", updated.Title)
	}

	// Delete (soft delete in this codebase — sets deleted_at).
	status, _ = env.DoJSON(t, http.MethodDelete, "/api/data/tasks/"+record.ID, token, nil)
	if status != http.StatusOK && status != http.StatusNoContent {
		t.Fatalf("delete record: status %d", status)
	}

	// After delete, list should be empty.
	status, body = env.DoJSON(t, http.MethodGet, "/api/data/tasks", token, nil)
	if status != http.StatusOK {
		t.Fatalf("list after delete: status %d, body %s", status, body)
	}
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if list.Total != 0 {
		t.Errorf("total after delete = %d, want 0", list.Total)
	}
}
