package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/choiceoh/phaeton/backend/internal/events"
	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/migration"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// WorkbookHandler serves folder CRUD, sheet-within-workbook management, and workbook locking.
// Core workbook CRUD (list/create/update/delete) lives in SchemaHandler.
type WorkbookHandler struct {
	store  *schema.Store
	cache  *schema.Cache
	engine *migration.Engine
	broker *events.Broker
}

func NewWorkbookHandler(store *schema.Store, cache *schema.Cache, engine *migration.Engine, broker *events.Broker) *WorkbookHandler {
	return &WorkbookHandler{store: store, cache: cache, engine: engine, broker: broker}
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

// ---------- Workbook Lock ----------

// AcquireLock acquires an edit lock on a workbook. Returns 409 if another user holds it.
func (h *WorkbookHandler) AcquireLock(w http.ResponseWriter, r *http.Request) {
	wbID := chi.URLParam(r, "workbookId")
	user, ok := middleware.GetUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	wb, err := h.store.AcquireLock(r.Context(), wbID, user.UserID)
	if err != nil {
		if err == schema.ErrConflict {
			// Return 423 Locked with lock holder info.
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusLocked)
			writeJSON(w, http.StatusLocked, map[string]any{
				"locked_by": wb.LockedBy,
				"locked_at": wb.LockedAt,
			})
			return
		}
		handleErr(w, r, err)
		return
	}

	// Broadcast lock event.
	h.broker.Broadcast(events.SSEMessage{
		Type:        string(events.EventWorkbookLocked),
		WorkbookID:  wbID,
		ActorUserID: user.UserID,
		ActorName:   user.Name,
	})
	_ = h.cache.ReloadWorkbook(r.Context(), wbID)

	writeJSON(w, http.StatusOK, wb)
}

// ReleaseLock releases the edit lock on a workbook.
func (h *WorkbookHandler) ReleaseLock(w http.ResponseWriter, r *http.Request) {
	wbID := chi.URLParam(r, "workbookId")
	user, ok := middleware.GetUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Directors can force-release any lock.
	if user.Role == "director" {
		if err := h.store.ForceReleaseLock(r.Context(), wbID); err != nil {
			handleErr(w, r, err)
			return
		}
	} else {
		if err := h.store.ReleaseLock(r.Context(), wbID, user.UserID); err != nil {
			if err == schema.ErrConflict {
				writeError(w, http.StatusForbidden, "lock held by another user")
				return
			}
			handleErr(w, r, err)
			return
		}
	}

	h.broker.Broadcast(events.SSEMessage{
		Type:        string(events.EventWorkbookUnlocked),
		WorkbookID:  wbID,
		ActorUserID: user.UserID,
		ActorName:   user.Name,
	})
	_ = h.cache.ReloadWorkbook(r.Context(), wbID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "unlocked"})
}

// GetLock returns the current lock status of a workbook.
func (h *WorkbookHandler) GetLock(w http.ResponseWriter, r *http.Request) {
	wbID := chi.URLParam(r, "workbookId")
	wb, ok := h.cache.WorkbookByID(wbID)
	if !ok {
		writeError(w, http.StatusNotFound, "workbook not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"locked_by": wb.LockedBy,
		"locked_at": wb.LockedAt,
	})
}
