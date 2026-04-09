package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"github.com/choiceoh/phaeton/backend/internal/infra/apierr"
)

type contextKey string

const userContextKey contextKey = "user"

// UserClaims holds JWT claims for the authenticated user.
type UserClaims struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

// RequireAuth returns middleware that validates JWT from Authorization header or cookie.
func RequireAuth() func(http.Handler) http.Handler {
	secret := []byte(jwtSecret())
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractToken(r)
			if tokenStr == "" {
				apierr.Unauthorized("missing token").Write(w)
				return
			}

			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return secret, nil
			})
			if err != nil || !token.Valid {
				apierr.Unauthorized("invalid token").Write(w)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				apierr.Unauthorized("invalid claims").Write(w)
				return
			}

			user, err := claimsToUser(claims)
			if err != nil {
				apierr.Unauthorized("invalid claims: " + err.Error()).Write(w)
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// claimsToUser safely extracts UserClaims from JWT map claims.
// Returns an error instead of panicking on type mismatch.
func claimsToUser(claims jwt.MapClaims) (UserClaims, error) {
	user := UserClaims{}

	if userID, ok := claims["userId"].(string); ok {
		user.UserID = userID
	} else {
		return user, errInvalidClaim("userId")
	}
	if email, ok := claims["email"].(string); ok {
		user.Email = email
	} else {
		return user, errInvalidClaim("email")
	}
	if name, ok := claims["name"].(string); ok {
		user.Name = name
	} else {
		return user, errInvalidClaim("name")
	}
	if role, ok := claims["role"].(string); ok {
		user.Role = role
	} else {
		return user, errInvalidClaim("role")
	}

	return user, nil
}

func errInvalidClaim(key string) error { return &claimError{kind: "invalid", key: key} }

type claimError struct{ kind, key string }

func (e *claimError) Error() string { return e.kind + " " + e.key }

// GetUser extracts the authenticated user from request context.
func GetUser(ctx context.Context) (UserClaims, bool) {
	u, ok := ctx.Value(userContextKey).(UserClaims)
	return u, ok
}

func extractToken(r *http.Request) string {
	// Authorization: Bearer <token>
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	// httpOnly cookie
	if c, err := r.Cookie("token"); err == nil {
		return c.Value
	}
	return ""
}

func jwtSecret() string {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return s
	}
	return "phaeton-dev-secret-change-in-production"
}
