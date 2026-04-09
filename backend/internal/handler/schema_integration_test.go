package handler_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/choiceoh/phaeton/backend/internal/testutil"
)

func TestCollectionLifecycle(t *testing.T) {
	env := testutil.NewEnv(t)
	testutil.SeedDirector(t, env.Pool)
	token := env.Login(t, testutil.DirectorEmail, testutil.DirectorPassword)

	// 1. Create
	createBody := map[string]any{
		"slug":  "widgets",
		"label": "Widgets",
		"fields": []map[string]any{
			{"slug": "title", "label": "Title", "field_type": "text", "is_required": true},
			{"slug": "amount", "label": "Amount", "field_type": "number"},
		},
	}
	status, body := env.DoJSON(t, http.MethodPost, "/api/schema/collections", token, createBody)
	if status != http.StatusCreated {
		t.Fatalf("create: status %d, body %s", status, body)
	}

	var created struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	}
	testutil.UnmarshalEnvelope(t, body, &created)
	if created.Slug != "widgets" {
		t.Errorf("slug = %q, want widgets", created.Slug)
	}
	if created.ID == "" {
		t.Fatal("id is empty")
	}

	// 2. The data table must actually exist.
	tableExists := func() bool {
		var exists bool
		err := env.Pool.QueryRow(context.Background(), `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_schema = 'data' AND table_name = 'widgets'
			)
		`).Scan(&exists)
		if err != nil {
			t.Fatalf("check table: %v", err)
		}
		return exists
	}
	if !tableExists() {
		t.Fatal("data.widgets table was not created")
	}

	// 3. List collections — must include the new one.
	status, body = env.DoJSON(t, http.MethodGet, "/api/schema/collections", token, nil)
	if status != http.StatusOK {
		t.Fatalf("list: status %d, body %s", status, body)
	}
	var listed []struct {
		Slug string `json:"slug"`
	}
	testutil.UnmarshalEnvelope(t, body, &listed)
	found := false
	for _, c := range listed {
		if c.Slug == "widgets" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("list missing widgets: %s", body)
	}

	// 4. Single fetch.
	status, _ = env.DoJSON(t, http.MethodGet, "/api/schema/collections/"+created.ID, token, nil)
	if status != http.StatusOK {
		t.Fatalf("get single: status %d", status)
	}

	// 5. Delete with confirmation.
	status, body = env.DoJSON(t, http.MethodDelete, "/api/schema/collections/"+created.ID+"?confirm=true", token, nil)
	if status != http.StatusOK {
		t.Fatalf("delete: status %d, body %s", status, body)
	}

	// 6. Table must be gone.
	if tableExists() {
		t.Error("data.widgets still exists after delete")
	}
}
