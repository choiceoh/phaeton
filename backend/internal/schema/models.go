package schema

import (
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/choiceoh/phaeton/backend/internal/pgutil"
)

// FieldType enumerates the supported column types.
type FieldType string

const (
	FieldText        FieldType = "text"
	FieldTextarea    FieldType = "textarea"
	FieldNumber      FieldType = "number"
	FieldInteger     FieldType = "integer"
	FieldBoolean     FieldType = "boolean"
	FieldDate        FieldType = "date"
	FieldDatetime    FieldType = "datetime"
	FieldTime        FieldType = "time"
	FieldSelect      FieldType = "select"
	FieldMultiselect FieldType = "multiselect"
	FieldRelation    FieldType = "relation"
	FieldFile        FieldType = "file"
	FieldJSON        FieldType = "json"
	FieldUser        FieldType = "user"

	FieldAutonumber FieldType = "autonumber"

	// Layout types — stored in _meta.fields for ordering but produce no DB column.
	FieldLabel  FieldType = "label"
	FieldLine   FieldType = "line"
	FieldSpacer FieldType = "spacer"
)

var validFieldTypes = map[FieldType]bool{
	FieldText: true, FieldTextarea: true, FieldNumber: true, FieldInteger: true,
	FieldBoolean: true, FieldDate: true, FieldDatetime: true, FieldTime: true,
	FieldSelect: true, FieldMultiselect: true, FieldRelation: true,
	FieldFile: true, FieldJSON: true, FieldUser: true, FieldAutonumber: true,
	FieldLabel: true, FieldLine: true, FieldSpacer: true,
}

func (ft FieldType) Valid() bool { return validFieldTypes[ft] }

// IsLayout returns true for field types that are purely visual (no DB column).
func (ft FieldType) IsLayout() bool {
	return ft == FieldLabel || ft == FieldLine || ft == FieldSpacer
}

// RelationType for inter-collection references.
type RelationType string

const (
	RelOneToOne   RelationType = "one_to_one"
	RelOneToMany  RelationType = "one_to_many"
	RelManyToMany RelationType = "many_to_many"
)

// Collection is the top-level schema unit (maps to a PostgreSQL table in the data schema).
type Collection struct {
	ID          string    `json:"id"`
	Slug        string    `json:"slug"`
	Label       string    `json:"label"`
	Description string    `json:"description,omitempty"`
	Icon        string    `json:"icon,omitempty"`
	IsSystem    bool      `json:"is_system"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	CreatedBy   string    `json:"created_by,omitempty"`
	Fields      []Field   `json:"fields,omitempty"`
}

// Field defines a single column inside a collection.
type Field struct {
	ID           string          `json:"id"`
	CollectionID string          `json:"collection_id"`
	Slug         string          `json:"slug"`
	Label        string          `json:"label"`
	FieldType    FieldType       `json:"field_type"`
	IsRequired   bool            `json:"is_required"`
	IsUnique     bool            `json:"is_unique"`
	IsIndexed    bool            `json:"is_indexed"`
	DefaultValue json.RawMessage `json:"default_value,omitempty"`
	Options      json.RawMessage `json:"options,omitempty"`
	Width        int16           `json:"width"`
	Height       int16           `json:"height"`
	SortOrder    int             `json:"sort_order"`
	IsLayout     bool            `json:"is_layout"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	Relation     *Relation       `json:"relation,omitempty"`
}

// Relation describes how a relation-type field links to another collection.
type Relation struct {
	ID                 string       `json:"id"`
	FieldID            string       `json:"field_id"`
	TargetCollectionID string       `json:"target_collection_id"`
	RelationType       RelationType `json:"relation_type"`
	JunctionTable      string       `json:"junction_table,omitempty"`
	OnDelete           string       `json:"on_delete"`
}

// --- pgtype UUID helpers (thin wrappers around pgutil) ---

func uuidStr(u pgtype.UUID) string {
	return pgutil.UUIDToString(u)
}

// parseUUID wraps pgutil.ParseUUID but returns an error on malformed input
// so the store layer can distinguish missing values from invalid ones.
func parseUUID(s string) (pgtype.UUID, error) {
	if s == "" {
		return pgtype.UUID{}, nil
	}
	u := pgutil.ParseUUID(s)
	if !u.Valid {
		return pgtype.UUID{}, errInvalidUUID
	}
	return u, nil
}

// --- Request DTOs ---

type CreateCollectionReq struct {
	Slug        string          `json:"slug"`
	Label       string          `json:"label"`
	Description string          `json:"description,omitempty"`
	Icon        string          `json:"icon,omitempty"`
	Fields      []CreateFieldIn `json:"fields,omitempty"`
}

type CreateFieldIn struct {
	Slug         string          `json:"slug"`
	Label        string          `json:"label"`
	FieldType    FieldType       `json:"field_type"`
	IsRequired   bool            `json:"is_required"`
	IsUnique     bool            `json:"is_unique"`
	IsIndexed    bool            `json:"is_indexed"`
	DefaultValue json.RawMessage `json:"default_value,omitempty"`
	Options      json.RawMessage `json:"options,omitempty"`
	Width        int16           `json:"width"`
	Height       int16           `json:"height"`
	Relation     *CreateRelIn    `json:"relation,omitempty"`
}

type CreateRelIn struct {
	TargetCollectionID string       `json:"target_collection_id"`
	RelationType       RelationType `json:"relation_type"`
	JunctionTable      string       `json:"junction_table,omitempty"`
	OnDelete           string       `json:"on_delete,omitempty"`
}

type UpdateCollectionReq struct {
	Label       *string `json:"label,omitempty"`
	Description *string `json:"description,omitempty"`
	Icon        *string `json:"icon,omitempty"`
	SortOrder   *int    `json:"sort_order,omitempty"`
}

type UpdateFieldReq struct {
	Label        *string         `json:"label,omitempty"`
	FieldType    *FieldType      `json:"field_type,omitempty"`
	IsRequired   *bool           `json:"is_required,omitempty"`
	IsUnique     *bool           `json:"is_unique,omitempty"`
	IsIndexed    *bool           `json:"is_indexed,omitempty"`
	DefaultValue json.RawMessage `json:"default_value,omitempty"`
	Options      json.RawMessage `json:"options,omitempty"`
	Width        *int16          `json:"width,omitempty"`
	Height       *int16          `json:"height,omitempty"`
}
