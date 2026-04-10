package handler

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// SchemaHandler serves the Schema API (/api/schema/...).
type SchemaHandler struct {
	pool   *pgxpool.Pool
	store  *schema.Store
	cache  *schema.Cache
	engine *migration.Engine
}

func NewSchemaHandler(pool *pgxpool.Pool, store *schema.Store, cache *schema.Cache, engine *migration.Engine) *SchemaHandler {
	return &SchemaHandler{pool: pool, store: store, cache: cache, engine: engine}
}

// --- Collections ---

func (h *SchemaHandler) ListCollections(w http.ResponseWriter, r *http.Request) {
	cols := h.cache.Collections()
	writeJSON(w, http.StatusOK, cols)
}

// CollectionCounts returns a map of collection slug → row count for all
// collections in a single query, avoiding the N+1 per-card fetches.
func (h *SchemaHandler) CollectionCounts(w http.ResponseWriter, r *http.Request) {
	cols := h.cache.Collections()
	if len(cols) == 0 {
		writeJSON(w, http.StatusOK, map[string]int64{})
		return
	}

	// Build a UNION ALL query: SELECT 'slug' AS slug, COUNT(*) FROM "data"."slug" UNION ALL ...
	var sql string
	for i, col := range cols {
		if i > 0 {
			sql += " UNION ALL "
		}
		quoted := fmt.Sprintf(`SELECT '%s' AS slug, COUNT(*) AS cnt FROM "data".%q`, col.Slug, col.Slug)
		sql += quoted
	}

	rows, err := h.pool.Query(r.Context(), sql)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	result := make(map[string]int64, len(cols))
	for rows.Next() {
		var slug string
		var cnt int64
		if err := rows.Scan(&slug, &cnt); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		result[slug] = cnt
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *SchemaHandler) GetCollection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	col, err := h.store.GetCollection(r.Context(), id)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, col)
}

func (h *SchemaHandler) CreateCollection(w http.ResponseWriter, r *http.Request) {
	var req schema.CreateCollectionReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if user, ok := middleware.GetUser(r.Context()); ok {
		req.CreatedBy = user.UserID
	}

	col, err := h.engine.CreateCollection(r.Context(), &req)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, col)
}

func (h *SchemaHandler) UpdateCollection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req schema.UpdateCollectionReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	col, err := h.engine.UpdateCollection(r.Context(), id, &req)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, col)
}

func (h *SchemaHandler) DeleteCollection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	confirmed := r.URL.Query().Get("confirm") == "true"

	if !confirmed {
		preview, err := h.engine.PreviewDropCollection(r.Context(), id)
		if err != nil {
			handleErr(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"confirmation_required": true,
			"preview":               preview,
		})
		return
	}

	if err := h.engine.DropCollection(r.Context(), id); err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// --- Fields ---

func (h *SchemaHandler) AddField(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "id")
	var req schema.CreateFieldIn
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	confirmed := r.URL.Query().Get("confirm") == "true"
	field, preview, err := h.engine.AddField(r.Context(), collectionID, &req, confirmed)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	if preview != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"confirmation_required": true,
			"preview":               preview,
		})
		return
	}
	writeJSON(w, http.StatusCreated, field)
}

func (h *SchemaHandler) UpdateField(w http.ResponseWriter, r *http.Request) {
	fieldID := chi.URLParam(r, "fieldId")
	var req schema.UpdateFieldReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	confirmed := r.URL.Query().Get("confirm") == "true"
	preview, err := h.engine.AlterField(r.Context(), fieldID, &req, confirmed)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	if preview != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"confirmation_required": true,
			"preview":               preview,
		})
		return
	}

	field, err := h.store.GetField(r.Context(), fieldID)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, field)
}

func (h *SchemaHandler) DeleteField(w http.ResponseWriter, r *http.Request) {
	fieldID := chi.URLParam(r, "fieldId")
	confirmed := r.URL.Query().Get("confirm") == "true"

	if !confirmed {
		preview, err := h.engine.PreviewDropField(r.Context(), fieldID)
		if err != nil {
			handleErr(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"confirmation_required": true,
			"preview":               preview,
		})
		return
	}

	if err := h.engine.DropField(r.Context(), fieldID); err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// --- Process ---

func (h *SchemaHandler) GetProcess(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "id")
	proc, err := h.engine.GetProcess(r.Context(), collectionID)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, proc)
}

func (h *SchemaHandler) SaveProcess(w http.ResponseWriter, r *http.Request) {
	collectionID := chi.URLParam(r, "id")
	var req schema.SaveProcessReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	proc, err := h.engine.SaveProcess(r.Context(), collectionID, &req)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, proc)
}

// --- Migrations ---

func (h *SchemaHandler) MigrationHistory(w http.ResponseWriter, r *http.Request) {
	collectionID := r.URL.Query().Get("collection_id")
	var (
		migs []migration.Migration
		err  error
	)
	if collectionID != "" {
		migs, err = h.engine.History(r.Context(), collectionID)
	} else {
		migs, err = h.engine.FullHistory(r.Context())
	}
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, migs)
}

func (h *SchemaHandler) RollbackMigration(w http.ResponseWriter, r *http.Request) {
	migrationID := chi.URLParam(r, "migrationId")
	if err := h.engine.Rollback(r.Context(), migrationID); err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "rolled_back"})
}
