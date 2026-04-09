package migration_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/choiceoh/phaeton/backend/internal/testutil"
)

// TestAddFieldRunsDDL verifies that calling /api/schema/collections/{id}/fields
// actually runs ALTER TABLE and the new column shows up in information_schema.
//
// This goes through the HTTP layer rather than calling Engine.AddField directly
// so we exercise the full handler→engine→store→DB path that production hits.
func TestAddFieldRunsDDL(t *testing.T) {
	env := testutil.NewEnv(t)
	testutil.SeedDirector(t, env.Pool)
	token := env.Login(t, testutil.DirectorEmail, testutil.DirectorPassword)

	// Create a collection with one field.
	createBody := map[string]any{
		"slug":  "notes",
		"label": "Notes",
		"fields": []map[string]any{
			{"slug": "body", "label": "Body", "field_type": "text"},
		},
	}
	status, body := env.DoJSON(t, http.MethodPost, "/api/schema/collections", token, createBody)
	if status != http.StatusCreated {
		t.Fatalf("create collection: status %d, body %s", status, body)
	}
	var col struct {
		ID string `json:"id"`
	}
	testutil.UnmarshalEnvelope(t, body, &col)

	// Add a new field via the schema API.
	addBody := map[string]any{
		"slug":       "tag",
		"label":      "Tag",
		"field_type": "text",
	}
	status, body = env.DoJSON(t, http.MethodPost, "/api/schema/collections/"+col.ID+"/fields", token, addBody)
	if status != http.StatusCreated {
		t.Fatalf("add field: status %d, body %s", status, body)
	}

	// Verify the column actually exists in the data table.
	var exists bool
	err := env.Pool.QueryRow(context.Background(), `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'data'
			  AND table_name = 'notes'
			  AND column_name = 'tag'
		)
	`).Scan(&exists)
	if err != nil {
		t.Fatalf("check column: %v", err)
	}
	if !exists {
		t.Fatal("data.notes.tag column was not created by AddField")
	}
}
