package migration

import (
	"encoding/json"
	"time"
)

// SafetyLevel classifies how risky a schema change is.
type SafetyLevel string

const (
	Safe      SafetyLevel = "SAFE"
	Cautious  SafetyLevel = "CAUTIOUS"
	Dangerous SafetyLevel = "DANGEROUS"
)

// Operation identifies the kind of schema change.
type Operation string

const (
	OpCreateCollection Operation = "create_collection"
	OpDropCollection   Operation = "drop_collection"
	OpAddField         Operation = "add_field"
	OpAlterField       Operation = "alter_field"
	OpDropField        Operation = "drop_field"
)

// Migration is the persisted record in _history.schema_migrations.
type Migration struct {
	ID           string      `json:"id"`
	CollectionID string      `json:"collection_id"`
	Operation    Operation   `json:"operation"`
	Payload      json.RawMessage `json:"payload"`
	DDLUp        string      `json:"ddl_up"`
	DDLDown      string      `json:"ddl_down"`
	SafetyLevel  SafetyLevel `json:"safety_level"`
	CreatedAt    time.Time   `json:"created_at"`
	AppliedAt    *time.Time  `json:"applied_at,omitempty"`
	AppliedBy    string      `json:"applied_by,omitempty"`
	RolledBackAt *time.Time  `json:"rolled_back_at,omitempty"`
}

// Preview is returned to the client before a CAUTIOUS/DANGEROUS change is applied.
type Preview struct {
	SafetyLevel      SafetyLevel `json:"safety_level"`
	Description      string      `json:"description"`
	AffectedRows     int64       `json:"affected_rows"`
	IncompatibleRows int64       `json:"incompatible_rows,omitempty"`
	IncompatibleSample []map[string]any `json:"incompatible_sample,omitempty"`
	DDLUp            string      `json:"ddl_up"`
	DDLDown          string      `json:"ddl_down"`
	Warnings         []string    `json:"warnings,omitempty"`
}
