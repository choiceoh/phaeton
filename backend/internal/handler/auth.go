package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/choiceoh/phaeton/backend/internal/infra/apierr"
	"github.com/choiceoh/phaeton/backend/internal/middleware"
)

// User represents an auth.users row.
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Password  string    `json:"-"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Role constants.
const (
	RoleDirector = "director"
	RolePM       = "pm"
	RoleEngineer = "engineer"
	RoleViewer   = "viewer"
)

// LoginInput is the request body for /api/auth/login.
type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// TokenResponse is returned on successful login.
type TokenResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// normalizeEmail lowercases and trims whitespace.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// Login handles POST /api/auth/login.
func Login(pool *pgxpool.Pool, limiter *middleware.RateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input LoginInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			apierr.BadRequest("invalid request body").Write(w)
			return
		}
		defer r.Body.Close()

		ip := clientIP(r)

		if limiter != nil {
			if allowed, retryMs := limiter.Check(ip); !allowed {
				apierr.New(http.StatusTooManyRequests, "RATE_LIMITED",
					"too many failed attempts, try again later").
					With("retryAfterMs", retryMs).
					Write(w)
				return
			}
		}

		email := normalizeEmail(input.Email)

		var user User
		err := pool.QueryRow(r.Context(),
			`SELECT id, email, name, password, role, is_active
			 FROM auth.users WHERE LOWER(email) = $1`,
			email,
		).Scan(&user.ID, &user.Email, &user.Name, &user.Password, &user.Role, &user.IsActive)

		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				if limiter != nil {
					limiter.RecordFailure(ip)
				}
				apierr.Unauthorized("invalid credentials").Write(w)
				return
			}
			slog.Error("login: db query failed", "error", err, "email", email)
			apierr.WrapInternal("query user", err).Write(w)
			return
		}

		if !user.IsActive {
			apierr.Forbidden("account deactivated").Write(w)
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
			if limiter != nil {
				limiter.RecordFailure(ip)
			}
			apierr.Unauthorized("invalid credentials").Write(w)
			return
		}

		if limiter != nil {
			limiter.Reset(ip)
		}

		tokenStr, err := generateToken(user)
		if err != nil {
			slog.Error("login: token generation failed", "error", err)
			apierr.Internal("failed to generate token").Write(w)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "token",
			Value:    tokenStr,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   86400 * 7,
		})

		user.Password = ""
		writeJSON(w, http.StatusOK, TokenResponse{Token: tokenStr, User: user})
	}
}

// Logout handles POST /api/auth/logout.
// Clears the httpOnly cookie server-side so the client doesn't have to.
func Logout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{
			Name:     "token",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
		writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
	}
}

// Me handles GET /api/auth/me.
func Me() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := middleware.GetUser(r.Context())
		if !ok {
			apierr.Unauthorized("not authenticated").Write(w)
			return
		}
		writeJSON(w, http.StatusOK, user)
	}
}

// CreateUser handles POST /api/users (director only).
func CreateUser(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := middleware.GetUser(r.Context())
		if !ok {
			apierr.Unauthorized("not authenticated").Write(w)
			return
		}
		if caller.Role != RoleDirector {
			apierr.Forbidden("directors only").Write(w)
			return
		}

		var input struct {
			Email    string `json:"email"`
			Name     string `json:"name"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			apierr.BadRequest("invalid request body").Write(w)
			return
		}
		defer r.Body.Close()

		email := normalizeEmail(input.Email)
		if email == "" || input.Password == "" || input.Name == "" {
			apierr.BadRequest("email, name, and password are required").Write(w)
			return
		}

		switch input.Role {
		case RoleDirector, RolePM, RoleEngineer, RoleViewer:
		default:
			apierr.BadRequest("invalid role").Write(w)
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			slog.Error("create user: bcrypt failed", "error", err)
			apierr.Internal("failed to hash password").Write(w)
			return
		}

		var id string
		err = pool.QueryRow(r.Context(),
			`INSERT INTO auth.users (email, name, password, role)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			email, input.Name, string(hash), input.Role,
		).Scan(&id)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == pgerrcode.UniqueViolation {
				apierr.Conflict("email already exists").Write(w)
				return
			}
			slog.Error("create user: insert failed", "error", err)
			apierr.WrapInternal("create user", err).Write(w)
			return
		}

		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// ListUsers handles GET /api/users.
func ListUsers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := pool.Query(r.Context(),
			`SELECT id, email, name, role, is_active, created_at, updated_at
			 FROM auth.users ORDER BY name`)
		if err != nil {
			slog.Error("list users: query failed", "error", err)
			apierr.WrapInternal("query users", err).Write(w)
			return
		}
		defer rows.Close()

		users := make([]User, 0)
		for rows.Next() {
			var u User
			if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
				slog.Warn("list users: scan row failed", "error", err)
				continue
			}
			users = append(users, u)
		}
		if err := rows.Err(); err != nil {
			slog.Error("list users: rows iteration failed", "error", err)
		}
		writeJSON(w, http.StatusOK, users)
	}
}

func generateToken(user User) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "phaeton-dev-secret-change-in-production"
	}

	claims := jwt.MapClaims{
		"userId": user.ID,
		"email":  user.Email,
		"name":   user.Name,
		"role":   user.Role,
		"exp":    time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// clientIP extracts the client IP from the request.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if i := strings.LastIndexByte(r.RemoteAddr, ':'); i > 0 {
		return r.RemoteAddr[:i]
	}
	return r.RemoteAddr
}

// SeedDirector creates an initial director user if none exist.
func SeedDirector(ctx context.Context, pool *pgxpool.Pool) error {
	var count int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM auth.users`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx,
		`INSERT INTO auth.users (email, name, password, role) VALUES ($1, $2, $3, $4)`,
		"admin@phaeton.local", "관리자", string(hash), RoleDirector,
	)
	return err
}
