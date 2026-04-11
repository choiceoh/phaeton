package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// WorkbookHandler serves the Workbook & Folder API (/api/schema/workbooks/..., /api/schema/folders/...).
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

// ---------- Workbooks ----------

func (h *WorkbookHandler) ListWorkbooks(w http.ResponseWriter, r *http.Request) {
	workbooks := h.cache.Workbooks()

	// Enrich with sheet counts from cache.
	type wbWithCount struct {
		schema.Workbook
		SheetCount int `json:"sheet_count"`
	}
	out := make([]wbWithCount, 0, len(workbooks))
	for _, wb := range workbooks {
		sheets := h.cache.SheetsInWorkbook(wb.ID)
		out = append(out, wbWithCount{Workbook: wb, SheetCount: len(sheets)})
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *WorkbookHandler) GetWorkbook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	wb, err := h.store.GetWorkbook(r.Context(), id)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, wb)
}

func (h *WorkbookHandler) CreateWorkbook(w http.ResponseWriter, r *http.Request) {
	var req schema.CreateWorkbookReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if user, ok := middleware.GetUser(r.Context()); ok {
		req.CreatedBy = user.UserID
	}
	wb, err := h.store.CreateWorkbook(r.Context(), &req)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	_ = h.cache.ReloadWorkbook(r.Context(), wb.ID)
	writeJSON(w, http.StatusCreated, wb)
}

func (h *WorkbookHandler) UpdateWorkbook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req schema.UpdateWorkbookReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	wb, err := h.store.UpdateWorkbook(r.Context(), id, &req)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	_ = h.cache.ReloadWorkbook(r.Context(), id)
	writeJSON(w, http.StatusOK, wb)
}

func (h *WorkbookHandler) DeleteWorkbook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Get sheets that will be cascade-deleted so we can clean up the cache.
	sheets := h.cache.SheetsInWorkbook(id)

	tx, err := h.store.Pool().Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback(r.Context())

	// Drop all dynamic data tables for sheets in this workbook.
	for _, sheet := range sheets {
		if err := h.engine.DropCollectionInTx(r.Context(), tx, sheet.ID); err != nil {
			handleErr(w, r, err)
			return
		}
	}

	if err := h.store.DeleteWorkbookTx(r.Context(), tx, id); err != nil {
		handleErr(w, r, err)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Update cache.
	for _, sheet := range sheets {
		h.cache.RemoveCollection(sheet.ID)
	}
	h.cache.RemoveWorkbook(id)

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

	// Verify workbook exists.
	if _, ok := h.cache.WorkbookByID(wbID); !ok {
		writeError(w, http.StatusNotFound, "workbook not found")
		return
	}

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

	// Verify target workbook exists.
	if _, ok := h.cache.WorkbookByID(body.TargetWorkbookID); !ok {
		writeError(w, http.StatusNotFound, "target workbook not found")
		return
	}

	if err := h.store.MoveSheet(r.Context(), sheetID, body.TargetWorkbookID); err != nil {
		handleErr(w, r, err)
		return
	}

	// Reload collection to update the workbook reference in cache.
	_ = h.cache.ReloadCollection(r.Context(), sheetID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "moved"})
}
