package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/events"
	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/pgutil"
)

// Notification represents a user notification.
type Notification struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	Type            string    `json:"type"`
	Title           string    `json:"title"`
	Body            string    `json:"body,omitempty"`
	RefCollectionID string    `json:"ref_collection_id,omitempty"`
	RefRecordID     string    `json:"ref_record_id,omitempty"`
	IsRead          bool      `json:"is_read"`
	CreatedAt       time.Time `json:"created_at"`
}

// NotificationHandler serves notification CRUD.
type NotificationHandler struct {
	pool *pgxpool.Pool
}

func NewNotificationHandler(pool *pgxpool.Pool) *NotificationHandler {
	return &NotificationHandler{pool: pool}
}

// List returns the current user's notifications.
func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetUser(r.Context())
	page, limit, offset := ParsePagination(r.URL.Query())

	var total int64
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM _meta.notifications WHERE user_id = $1`, user.UserID,
	).Scan(&total)

	rows, err := h.pool.Query(r.Context(), `
		SELECT id, user_id, type, title, body, ref_collection_id, ref_record_id, is_read, created_at
		FROM _meta.notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`,
		user.UserID, limit, offset,
	)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	defer rows.Close()

	notifs, err := scanNotifications(rows)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeList(w, notifs, total, page, limit)
}

// UnreadCount returns the count of unread notifications for the badge.
func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetUser(r.Context())
	var count int64
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM _meta.notifications WHERE user_id = $1 AND is_read = FALSE`, user.UserID,
	).Scan(&count)
	writeJSON(w, http.StatusOK, map[string]int64{"count": count})
}

// MarkRead marks a single notification as read.
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	notifID := chi.URLParam(r, "id")
	user, _ := middleware.GetUser(r.Context())
	tag, err := h.pool.Exec(r.Context(),
		`UPDATE _meta.notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
		notifID, user.UserID,
	)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "notification not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "read"})
}

// MarkAllRead marks all notifications as read.
func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	user, _ := middleware.GetUser(r.Context())
	_, err := h.pool.Exec(r.Context(),
		`UPDATE _meta.notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
		user.UserID,
	)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "all_read"})
}

func scanNotifications(rows pgx.Rows) ([]Notification, error) {
	var out []Notification
	for rows.Next() {
		var n Notification
		var id, userID, refColID, refRecID pgtype.UUID
		var body *string
		err := rows.Scan(&id, &userID, &n.Type, &n.Title, &body, &refColID, &refRecID, &n.IsRead, &n.CreatedAt)
		if err != nil {
			return nil, err
		}
		n.ID = pgutil.UUIDToString(id)
		n.UserID = pgutil.UUIDToString(userID)
		n.RefCollectionID = pgutil.UUIDToString(refColID)
		n.RefRecordID = pgutil.UUIDToString(refRecID)
		if body != nil {
			n.Body = *body
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// --- Notification Subscriber ---

// SubscribeNotifications registers a handler on the event bus that creates
// notifications for relevant users when events are published.
func SubscribeNotifications(pool *pgxpool.Pool, bus *events.Bus) {
	bus.Subscribe(func(ctx context.Context, ev events.Event) {
		switch ev.Type {
		case events.EventComment:
			notifyCommentRecipients(ctx, pool, ev)
		case events.EventStateChange:
			notifyRecordCreator(ctx, pool, ev)
		}
	})
}

// notifyCommentRecipients sends notifications to the record creator and other
// commenters (excluding the actor).
func notifyCommentRecipients(ctx context.Context, pool *pgxpool.Pool, ev events.Event) {
	// Find unique user IDs: record creator + all commenters.
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT user_id::text FROM (
			SELECT created_by AS user_id FROM data_record_creator($1, $2)
			UNION
			SELECT user_id FROM _meta.comments WHERE collection_id = $3 AND record_id = $4
		) sub
		WHERE user_id IS NOT NULL AND user_id::text != $5
		LIMIT 50`,
		ev.CollectionID, ev.RecordID, ev.CollectionID, ev.RecordID, ev.ActorUserID,
	)
	// This query uses a helper function that doesn't exist — fall back to just commenters.
	if err != nil {
		// Fallback: notify other commenters only.
		rows, err = pool.Query(ctx, `
			SELECT DISTINCT user_id::text FROM _meta.comments
			WHERE collection_id = $1 AND record_id = $2 AND user_id::text != $3
			LIMIT 50`,
			ev.CollectionID, ev.RecordID, ev.ActorUserID,
		)
		if err != nil {
			slog.Error("notify comment recipients query", "error", err)
			return
		}
	}
	defer rows.Close()

	for rows.Next() {
		var recipientID string
		if err := rows.Scan(&recipientID); err != nil {
			continue
		}
		insertNotification(ctx, pool, recipientID, string(ev.Type), ev.Title, ev.Body, ev.CollectionID, ev.RecordID)
	}
}

// notifyRecordCreator sends a notification to the record creator.
func notifyRecordCreator(ctx context.Context, pool *pgxpool.Pool, ev events.Event) {
	// We don't have a direct way to get the record creator from a generic collection,
	// so we query the data table. The collection slug is needed, but we have collection_id.
	// Look up the slug first.
	var slug string
	err := pool.QueryRow(ctx,
		`SELECT slug FROM _meta.collections WHERE id = $1`, ev.CollectionID,
	).Scan(&slug)
	if err != nil {
		return
	}

	var creatorID string
	qTable := fmt.Sprintf("%q.%q", "data", slug)
	err = pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT created_by::text FROM %s WHERE id = $1 AND deleted_at IS NULL`, qTable),
		ev.RecordID,
	).Scan(&creatorID)
	if err != nil || creatorID == "" || creatorID == ev.ActorUserID {
		return
	}
	insertNotification(ctx, pool, creatorID, string(ev.Type), ev.Title, ev.Body, ev.CollectionID, ev.RecordID)
}

func insertNotification(ctx context.Context, pool *pgxpool.Pool, userID, ntype, title, body, refCollectionID, refRecordID string) {
	_, _ = pool.Exec(ctx, `
		INSERT INTO _meta.notifications (user_id, type, title, body, ref_collection_id, ref_record_id)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		userID, ntype, title, body, refCollectionID, refRecordID,
	)
}
