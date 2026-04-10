package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

func TestBuildRLSClause_CreatorMode(t *testing.T) {
	col := schema.Collection{
		AccessConfig: schema.AccessConfig{
			RLSMode: "creator",
		},
	}
	args := []any{"existing-arg"}
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := context.WithValue(r.Context(), middleware.ExportedUserContextKey, middleware.UserClaims{
		UserID: "user-123",
		Role:   "viewer",
	})
	r = r.WithContext(ctx)

	clause := buildRLSClause(r, col, &args, "")
	if clause == "" {
		t.Fatal("expected RLS clause for creator mode")
	}
	if len(args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(args))
	}
	if args[1] != "user-123" {
		t.Fatalf("expected user-123, got %v", args[1])
	}
}

func TestBuildRLSClause_DepartmentMode(t *testing.T) {
	col := schema.Collection{
		AccessConfig: schema.AccessConfig{
			RLSMode: "department",
		},
	}
	args := []any{}
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := context.WithValue(r.Context(), middleware.ExportedUserContextKey, middleware.UserClaims{
		UserID:       "user-456",
		Role:         "viewer",
		DepartmentID: "dept-789",
	})
	r = r.WithContext(ctx)

	clause := buildRLSClause(r, col, &args, "")
	if clause == "" {
		t.Fatal("expected RLS clause for department mode")
	}
	if len(args) != 1 {
		t.Fatalf("expected 1 arg, got %d", len(args))
	}
	if args[0] != "dept-789" {
		t.Fatalf("expected dept-789, got %v", args[0])
	}
}

func TestBuildRLSClause_DepartmentMode_NoDeptFallsBackToCreator(t *testing.T) {
	col := schema.Collection{
		AccessConfig: schema.AccessConfig{
			RLSMode: "department",
		},
	}
	args := []any{}
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	// User has no department — should fall back to creator mode.
	ctx := context.WithValue(r.Context(), middleware.ExportedUserContextKey, middleware.UserClaims{
		UserID: "user-000",
		Role:   "viewer",
	})
	r = r.WithContext(ctx)

	clause := buildRLSClause(r, col, &args, "")
	if clause == "" {
		t.Fatal("expected RLS clause")
	}
	// Should fall back to creator-only since no department.
	if len(args) != 1 {
		t.Fatalf("expected 1 arg, got %d", len(args))
	}
	if args[0] != "user-000" {
		t.Fatalf("expected user-000, got %v", args[0])
	}
}

func TestBuildRLSClause_WithPrefix(t *testing.T) {
	col := schema.Collection{
		AccessConfig: schema.AccessConfig{
			RLSMode: "creator",
		},
	}
	args := []any{}
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := context.WithValue(r.Context(), middleware.ExportedUserContextKey, middleware.UserClaims{
		UserID: "user-abc",
		Role:   "viewer",
	})
	r = r.WithContext(ctx)

	prefix := `"data"."projects"`
	clause := buildRLSClause(r, col, &args, prefix)
	if clause == "" {
		t.Fatal("expected RLS clause with prefix")
	}
	// Should reference prefix.created_by.
	if len(clause) < 10 {
		t.Fatalf("clause too short: %s", clause)
	}
}
