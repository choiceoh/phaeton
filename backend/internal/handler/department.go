package handler

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/choiceoh/phaeton/backend/internal/infra/apierr"
)

// Department represents an auth.departments row.
type Department struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	ParentID  *string    `json:"parent_id"`
	SortOrder int        `json:"sort_order"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// ListDepartments handles GET /api/departments.
func ListDepartments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := pool.Query(r.Context(),
			`SELECT id, name, parent_id, sort_order, created_at, updated_at
			 FROM auth.departments ORDER BY sort_order, name`)
		if err != nil {
			slog.Error("list departments: query failed", "error", err)
			apierr.WrapInternal("query departments", err).Write(w)
			return
		}
		defer rows.Close()

		depts := make([]Department, 0)
		for rows.Next() {
			var d Department
			if err := rows.Scan(&d.ID, &d.Name, &d.ParentID, &d.SortOrder, &d.CreatedAt, &d.UpdatedAt); err != nil {
				slog.Warn("list departments: scan row failed", "error", err)
				continue
			}
			depts = append(depts, d)
		}
		if err := rows.Err(); err != nil {
			slog.Error("list departments: rows iteration failed", "error", err)
		}
		writeJSON(w, http.StatusOK, depts)
	}
}

// GetDepartment handles GET /api/departments/{id}.
func GetDepartment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var d Department
		err := pool.QueryRow(r.Context(),
			`SELECT id, name, parent_id, sort_order, created_at, updated_at
			 FROM auth.departments WHERE id = $1`, id,
		).Scan(&d.ID, &d.Name, &d.ParentID, &d.SortOrder, &d.CreatedAt, &d.UpdatedAt)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apierr.NotFound("department not found").Write(w)
				return
			}
			slog.Error("get department: query failed", "error", err)
			apierr.WrapInternal("query department", err).Write(w)
			return
		}
		writeJSON(w, http.StatusOK, d)
	}
}

// CreateDepartment handles POST /api/departments (director only).
func CreateDepartment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Name      string  `json:"name"`
			ParentID  *string `json:"parent_id"`
			SortOrder int     `json:"sort_order"`
		}
		if err := readJSON(r, &input); err != nil {
			apierr.BadRequest("invalid request body").Write(w)
			return
		}
		if input.Name == "" {
			apierr.BadRequest("name is required").Write(w)
			return
		}

		// Validate parent exists if provided.
		if input.ParentID != nil && *input.ParentID != "" {
			var exists bool
			err := pool.QueryRow(r.Context(),
				`SELECT EXISTS(SELECT 1 FROM auth.departments WHERE id = $1)`,
				*input.ParentID).Scan(&exists)
			if err != nil {
				slog.Error("create department: parent check failed", "error", err)
				apierr.WrapInternal("check parent", err).Write(w)
				return
			}
			if !exists {
				apierr.BadRequest("parent department not found").Write(w)
				return
			}
		} else {
			input.ParentID = nil
		}

		var id string
		err := pool.QueryRow(r.Context(),
			`INSERT INTO auth.departments (name, parent_id, sort_order)
			 VALUES ($1, $2, $3) RETURNING id`,
			input.Name, input.ParentID, input.SortOrder,
		).Scan(&id)
		if err != nil {
			slog.Error("create department: insert failed", "error", err)
			apierr.WrapInternal("create department", err).Write(w)
			return
		}

		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// UpdateDepartment handles PATCH /api/departments/{id} (director only).
func UpdateDepartment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var input struct {
			Name      *string `json:"name"`
			ParentID  *string `json:"parent_id"`
			SortOrder *int    `json:"sort_order"`
		}
		if err := readJSON(r, &input); err != nil {
			apierr.BadRequest("invalid request body").Write(w)
			return
		}

		// Prevent self-reference.
		if input.ParentID != nil && *input.ParentID == id {
			apierr.BadRequest("department cannot be its own parent").Write(w)
			return
		}

		// Build dynamic SET clause.
		sets := []string{}
		args := []any{}
		argN := 1

		if input.Name != nil {
			if *input.Name == "" {
				apierr.BadRequest("name cannot be empty").Write(w)
				return
			}
			sets = append(sets, fmt.Sprintf("name = $%d", argN))
			args = append(args, *input.Name)
			argN++
		}
		if input.ParentID != nil {
			if *input.ParentID == "" {
				sets = append(sets, fmt.Sprintf("parent_id = $%d", argN))
				args = append(args, nil)
			} else {
				sets = append(sets, fmt.Sprintf("parent_id = $%d", argN))
				args = append(args, *input.ParentID)
			}
			argN++
		}
		if input.SortOrder != nil {
			sets = append(sets, fmt.Sprintf("sort_order = $%d", argN))
			args = append(args, *input.SortOrder)
			argN++
		}

		if len(sets) == 0 {
			apierr.BadRequest("no fields to update").Write(w)
			return
		}

		sets = append(sets, fmt.Sprintf("updated_at = now()"))
		query := fmt.Sprintf("UPDATE auth.departments SET %s WHERE id = $%d",
			strings.Join(sets, ", "), argN)
		args = append(args, id)

		tag, err := pool.Exec(r.Context(), query, args...)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == pgerrcode.ForeignKeyViolation {
				apierr.BadRequest("invalid parent department").Write(w)
				return
			}
			slog.Error("update department: exec failed", "error", err)
			apierr.WrapInternal("update department", err).Write(w)
			return
		}
		if tag.RowsAffected() == 0 {
			apierr.NotFound("department not found").Write(w)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

// DeleteDepartment handles DELETE /api/departments/{id} (director only).
func DeleteDepartment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		tag, err := pool.Exec(r.Context(),
			`DELETE FROM auth.departments WHERE id = $1`, id)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == pgerrcode.ForeignKeyViolation {
				apierr.BadRequest("department has child departments or assigned users").Write(w)
				return
			}
			slog.Error("delete department: exec failed", "error", err)
			apierr.WrapInternal("delete department", err).Write(w)
			return
		}
		if tag.RowsAffected() == 0 {
			apierr.NotFound("department not found").Write(w)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	}
}
