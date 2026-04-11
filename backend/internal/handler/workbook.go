package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// WorkbookHandler serves folder CRUD and sheet-within-workbook management.
// Core workbook CRUD (list/create/update/delete) lives in SchemaHandler.
type WorkbookHandler struct {
	store  *schema.Store
	cache  *schema.Cache
	engine *migration.Engine
}

func NewWorkbookHandler(store *schema.Store, cache *schema.Cache, engine *migration.Engine) *WorkbookHandler {
	return &WorkbookHandler{store: store, cache: cache, engine: engine}
}

// ---------- Folders ----------

func (h *WorkbookHandler) ListFolders(w http.ResponseWriter, r *http.Request) {
	folders := h.cache.Folders()
	writeJSON(w, http.StatusOK, folders)
}

func (h *WorkbookHandler) GetFolder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	folder, err := h.store.GetFolder(r.Context(), id)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, folder)
}

func (h *WorkbookHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	var req schema.CreateFolderReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if user, ok := middleware.GetUser(r.Context()); ok {
		req.CreatedBy = user.UserID
	}
	folder, err := h.store.CreateFolder(r.Context(), &req)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	_ = h.cache.ReloadFolders(r.Context())
	writeJSON(w, http.StatusCreated, folder)
}

func (h *WorkbookHandler) UpdateFolder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req schema.UpdateFolderReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	folder, err := h.store.UpdateFolder(r.Context(), id, &req)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	_ = h.cache.ReloadFolders(r.Context())
	writeJSON(w, http.StatusOK, folder)
}

func (h *WorkbookHandler) DeleteFolder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.store.DeleteFolder(r.Context(), id); err != nil {
		handleErr(w, r, err)
		return
	}
	_ = h.cache.ReloadFolders(r.Context())
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------- Sheets within Workbook ----------

func (h *WorkbookHandler) ListSheets(w http.ResponseWriter, r *http.Request) {
	wbID := chi.URLParam(r, "id")
	sheets := h.cache.SheetsInWorkbook(wbID)
	writeJSON(w, http.StatusOK, sheets)
}

func (h *WorkbookHandler) CreateSheet(w http.ResponseWriter, r *http.Request) {
	wbID := chi.URLParam(r, "id")

	var req schema.CreateCollectionReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.WorkbookID = wbID

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

func (h *WorkbookHandler) MoveSheet(w http.ResponseWriter, r *http.Request) {
	sheetID := chi.URLParam(r, "id")
	var body struct {
		TargetWorkbookID string `json:"target_workbook_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.TargetWorkbookID == "" {
		writeError(w, http.StatusBadRequest, "target_workbook_id is required")
		return
	}

	if err := h.store.MoveSheet(r.Context(), sheetID, body.TargetWorkbookID); err != nil {
		handleErr(w, r, err)
		return
	}

	_ = h.cache.ReloadCollection(r.Context(), sheetID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "moved"})
}
