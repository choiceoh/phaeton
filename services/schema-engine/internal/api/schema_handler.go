package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/migration"
	"github.com/choiceoh/phaeton/services/schema-engine/internal/schema"
)

// SchemaHandler serves the Schema API (/api/schema/...).
type SchemaHandler struct {
	store  *schema.Store
	cache  *schema.Cache
	engine *migration.Engine
}

func NewSchemaHandler(store *schema.Store, cache *schema.Cache, engine *migration.Engine) *SchemaHandler {
	return &SchemaHandler{store: store, cache: cache, engine: engine}
}

// --- Collections ---

func (h *SchemaHandler) ListCollections(w http.ResponseWriter, r *http.Request) {
	cols := h.cache.Collections()
	writeJSON(w, http.StatusOK, cols)
}

func (h *SchemaHandler) GetCollection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	col, err := h.store.GetCollection(r.Context(), id)
	if err != nil {
		handleErr(w, err)
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

	col, err := h.engine.CreateCollection(r.Context(), &req)
	if err != nil {
		handleErr(w, err)
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
	col, err := h.store.UpdateCollection(r.Context(), id, &req)
	if err != nil {
		handleErr(w, err)
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
			handleErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"confirmation_required": true,
			"preview":               preview,
		})
		return
	}

	if err := h.engine.DropCollection(r.Context(), id); err != nil {
		handleErr(w, err)
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
		handleErr(w, err)
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
		handleErr(w, err)
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
		handleErr(w, err)
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
			handleErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"confirmation_required": true,
			"preview":               preview,
		})
		return
	}

	if err := h.engine.DropField(r.Context(), fieldID); err != nil {
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
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
		handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, migs)
}

func (h *SchemaHandler) RollbackMigration(w http.ResponseWriter, r *http.Request) {
	migrationID := chi.URLParam(r, "migrationId")
	if err := h.engine.Rollback(r.Context(), migrationID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "rolled_back"})
}
