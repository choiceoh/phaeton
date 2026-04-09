package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/handler"
	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/schema"
	"github.com/choiceoh/phaeton/backend/internal/server"
)

// Env wires a real Postgres pool to a fully-configured httptest server.
// All cleanup (pool.Close, server.Close, limiter.Close) is registered via
// t.Cleanup so callers don't have to remember anything.
type Env struct {
	Pool    *pgxpool.Pool
	Server  *httptest.Server
	BaseURL string
}

// NewEnv builds a fresh test environment with an empty schema.
//
// Steps:
//  1. Open pool against TEST_DATABASE_URL (skips test if unset).
//  2. Drop + re-create all schemas.
//  3. Build schema store/cache + migration engine.
//  4. Wire SchemaHandler / DynHandler.
//  5. Mount router via server.BuildRouter and start httptest server.
func NewEnv(t *testing.T) *Env {
	t.Helper()

	pool := NewTestPool(t)
	ResetSchema(t, pool)

	ctx := context.Background()

	store := schema.NewStore(pool)
	cache := schema.NewCache(store)
	if err := cache.Load(ctx); err != nil {
		t.Fatalf("cache load: %v", err)
	}

	migEngine := migration.NewEngine(pool, store, cache)
	schemaH := handler.NewSchemaHandler(store, cache, migEngine)
	dynH := handler.NewDynHandler(pool, cache)

	// Test rate limiter — short windows so concurrent tests don't lock each other out.
	limiter := middleware.NewRateLimiter(5, 60_000, 60_000)
	t.Cleanup(limiter.Close)

	r := server.BuildRouter(server.Deps{
		Pool:         pool,
		Schema:       schemaH,
		Dyn:          dynH,
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		LoginLimiter: limiter,
	})

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)

	return &Env{Pool: pool, Server: ts, BaseURL: ts.URL}
}

// DoJSON sends a request with optional JSON body + bearer token and returns
// the status code and raw response body. Envelope unwrap is the caller's job —
// tests often want to inspect the raw envelope (data, total, error, ...).
func (e *Env) DoJSON(t *testing.T, method, path, token string, body any) (int, []byte) {
	t.Helper()

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, e.BaseURL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	return resp.StatusCode, respBody
}

// Login posts to /api/auth/login and returns the JWT.
// Fails the test on any non-200 response.
//
// All handler responses use the {data, error?} envelope (see handler/json.go),
// so we unwrap the envelope here so callers don't have to.
func (e *Env) Login(t *testing.T, email, password string) string {
	t.Helper()

	status, body := e.DoJSON(t, http.MethodPost, "/api/auth/login", "", map[string]string{
		"email":    email,
		"password": password,
	})
	if status != http.StatusOK {
		t.Fatalf("login: status %d, body %s", status, body)
	}

	var resp struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("unmarshal login response: %v", err)
	}
	if resp.Data.Token == "" {
		t.Fatalf("login: empty token (body %s)", body)
	}
	return resp.Data.Token
}

// UnmarshalEnvelope unmarshals the {data: T} envelope into out.
// Convenience for tests that just want the inner payload.
func UnmarshalEnvelope(t *testing.T, body []byte, out any) {
	t.Helper()
	wrapper := struct {
		Data json.RawMessage `json:"data"`
	}{}
	if err := json.Unmarshal(body, &wrapper); err != nil {
		t.Fatalf("unmarshal envelope: %v (body %s)", err, body)
	}
	if len(wrapper.Data) == 0 {
		t.Fatalf("envelope.data missing (body %s)", body)
	}
	if err := json.Unmarshal(wrapper.Data, out); err != nil {
		t.Fatalf("unmarshal envelope.data: %v (data %s)", err, wrapper.Data)
	}
}
