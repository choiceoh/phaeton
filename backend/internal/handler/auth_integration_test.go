package handler_test

import (
	"net/http"
	"testing"

	"github.com/choiceoh/phaeton/backend/internal/testutil"
)

func TestLoginAndMe(t *testing.T) {
	env := testutil.NewEnv(t)
	testutil.SeedDirector(t, env.Pool)

	token := env.Login(t, testutil.DirectorEmail, testutil.DirectorPassword)

	status, body := env.DoJSON(t, http.MethodGet, "/api/auth/me", token, nil)
	if status != http.StatusOK {
		t.Fatalf("/api/auth/me: status %d, body %s", status, body)
	}

	var user struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	testutil.UnmarshalEnvelope(t, body, &user)

	if user.Email != testutil.DirectorEmail {
		t.Errorf("email = %q, want %q", user.Email, testutil.DirectorEmail)
	}
	if user.Role != "director" {
		t.Errorf("role = %q, want director", user.Role)
	}
}

func TestLoginWrongPassword(t *testing.T) {
	env := testutil.NewEnv(t)
	testutil.SeedDirector(t, env.Pool)

	status, _ := env.DoJSON(t, http.MethodPost, "/api/auth/login", "", map[string]string{
		"email":    testutil.DirectorEmail,
		"password": "definitely-not-the-password",
	})
	if status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", status)
	}
}
