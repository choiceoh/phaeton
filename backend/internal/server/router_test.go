package server_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/choiceoh/phaeton/backend/internal/testutil"
)

func TestHealth(t *testing.T) {
	env := testutil.NewEnv(t)

	status, body := env.DoJSON(t, http.MethodGet, "/api/health", "", nil)
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", status, body)
	}
	if !strings.Contains(string(body), `"status":"ok"`) {
		t.Errorf("body = %q, want status:ok", body)
	}
}

func TestNotFound(t *testing.T) {
	env := testutil.NewEnv(t)

	status, _ := env.DoJSON(t, http.MethodGet, "/api/does-not-exist", "", nil)
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", status)
	}
}

func TestProtectedRouteWithoutToken(t *testing.T) {
	env := testutil.NewEnv(t)

	status, _ := env.DoJSON(t, http.MethodGet, "/api/auth/me", "", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", status)
	}
}
