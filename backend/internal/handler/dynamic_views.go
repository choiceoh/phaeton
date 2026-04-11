package handler

import (
	"fmt"
	"time"

	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// ---------------------------------------------------------------------------
// Shared helpers (used by schema.go and other handlers)
// ---------------------------------------------------------------------------

// toDateStrGo extracts YYYY-MM-DD from various date representations.
func toDateStrGo(v any) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case time.Time:
		return val.Format("2006-01-02")
	case string:
		if len(val) >= 10 {
			s := val[:10]
			if _, err := time.Parse("2006-01-02", s); err == nil {
				return s
			}
		}
		return ""
	default:
		s := fmt.Sprintf("%v", val)
		if len(s) >= 10 {
			candidate := s[:10]
			if _, err := time.Parse("2006-01-02", candidate); err == nil {
				return candidate
			}
		}
		return ""
	}
}

// buildAllowedMoves constructs the allowed_moves map from process transitions.
func buildAllowedMoves(proc schema.Process, userRole, userID string) map[string][]string {
	// Build ID → name lookup.
	idToName := make(map[string]string, len(proc.Statuses))
	for _, s := range proc.Statuses {
		idToName[s.ID] = s.Name
	}

	moves := make(map[string][]string)
	for _, s := range proc.Statuses {
		moves[s.Name] = []string{}
	}

	for _, t := range proc.Transitions {
		if !isTransitionAllowed(t, userRole, userID) {
			continue
		}
		fromName := idToName[t.FromStatusID]
		toName := idToName[t.ToStatusID]
		if fromName != "" && toName != "" {
			moves[fromName] = append(moves[fromName], toName)
		}
	}

	return moves
}

// isTransitionAllowed checks if a user (by role and/or ID) is permitted to perform a transition.
func isTransitionAllowed(t schema.ProcessTransition, userRole, userID string) bool {
	if len(t.AllowedRoles) == 0 && len(t.AllowedUserIDs) == 0 {
		return true
	}
	for _, r := range t.AllowedRoles {
		if r == userRole {
			return true
		}
	}
	for _, uid := range t.AllowedUserIDs {
		if uid == userID {
			return true
		}
	}
	return false
}
