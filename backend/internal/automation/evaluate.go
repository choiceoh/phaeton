package automation

import (
	"encoding/json"
	"fmt"
	"strings"
)

// evaluateConditions returns true if all conditions match the record (AND logic).
// An empty condition list always returns true.
func evaluateConditions(conditions []Condition, record map[string]any) bool {
	for _, c := range conditions {
		if !evaluateOne(c, record) {
			return false
		}
	}
	return true
}

func evaluateOne(c Condition, record map[string]any) bool {
	val, exists := record[c.FieldSlug]

	switch c.Operator {
	case OpIsEmpty:
		return !exists || val == nil || fmt.Sprintf("%v", val) == ""
	case OpIsNotEmpty:
		return exists && val != nil && fmt.Sprintf("%v", val) != ""
	}

	// For remaining operators, stringify both sides for comparison.
	actual := stringify(val)
	expected := c.Value

	switch c.Operator {
	case OpEquals:
		return actual == expected
	case OpNotEquals:
		return actual != expected
	case OpContains:
		return strings.Contains(actual, expected)
	case OpGT:
		return compareNumeric(actual, expected) > 0
	case OpLT:
		return compareNumeric(actual, expected) < 0
	default:
		return false
	}
}

// matchTriggerConfig checks trigger-specific config (e.g. from/to status).
func matchTriggerConfig(a Automation, statusFrom, statusTo string) bool {
	if a.TriggerType != TriggerStatusChange {
		return true
	}
	var cfg TriggerStatusConfig
	if err := json.Unmarshal(a.TriggerConfig, &cfg); err != nil {
		return false
	}
	if cfg.FromStatus != "" && cfg.FromStatus != statusFrom {
		return false
	}
	if cfg.ToStatus != "" && cfg.ToStatus != statusTo {
		return false
	}
	return true
}

func stringify(v any) string {
	if v == nil {
		return ""
	}
	switch tv := v.(type) {
	case string:
		return tv
	case json.Number:
		return tv.String()
	default:
		return fmt.Sprintf("%v", tv)
	}
}

func compareNumeric(a, b string) int {
	var fa, fb float64
	if _, err := fmt.Sscanf(a, "%f", &fa); err != nil {
		return strings.Compare(a, b)
	}
	if _, err := fmt.Sscanf(b, "%f", &fb); err != nil {
		return strings.Compare(a, b)
	}
	switch {
	case fa < fb:
		return -1
	case fa > fb:
		return 1
	default:
		return 0
	}
}
