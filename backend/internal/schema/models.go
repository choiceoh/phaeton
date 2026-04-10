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
	FieldUser        FieldType = "user"
	FieldFile        FieldType = "file"
	FieldJSON        FieldType = "json"

	FieldAutonumber   FieldType = "autonumber"
	FieldTable        FieldType = "table"       // Inline repeating table stored as JSONB.
	FieldSpreadsheet  FieldType = "spreadsheet" // Excel-like spreadsheet stored as JSONB.

	// Computed types — stored in _meta.fields but produce no DB column.
	// Values are calculated at read time from other fields/relations.
	FieldFormula FieldType = "formula"
	FieldLookup  FieldType = "lookup"
	FieldRollup  FieldType = "rollup"

	// Layout types — stored in _meta.fields for ordering but produce no DB column.
	FieldLabel  FieldType = "label"
	FieldLine   FieldType = "line"
	FieldSpacer FieldType = "spacer"
)

var validFieldTypes = map[FieldType]bool{
	FieldText: true, FieldTextarea: true, FieldNumber: true, FieldInteger: true,
	FieldBoolean: true, FieldDate: true, FieldDatetime: true, FieldTime: true,
	FieldSelect: true, FieldMultiselect: true, FieldRelation: true,
	FieldFile: true, FieldJSON: true, FieldUser: true, FieldAutonumber: true, FieldTable: true, FieldSpreadsheet: true,
	FieldFormula: true, FieldLookup: true, FieldRollup: true,
	FieldLabel: true, FieldLine: true, FieldSpacer: true,
}

func (ft FieldType) Valid() bool { return validFieldTypes[ft] }

// IsLayout returns true for field types that are purely visual (no DB column).
func (ft FieldType) IsLayout() bool {
	return ft == FieldLabel || ft == FieldLine || ft == FieldSpacer
}

// IsComputed returns true for field types that are calculated at read time (no DB column).
func (ft FieldType) IsComputed() bool {
	return ft == FieldFormula || ft == FieldLookup || ft == FieldRollup
}

// NoColumn returns true for field types that do not produce a DB column.
func (ft FieldType) NoColumn() bool {
	return ft.IsLayout() || ft.IsComputed()
}

// IsManyToMany returns true if this is a M:N relation field (no DB column).
func (f Field) IsManyToMany() bool {
	return f.FieldType == FieldRelation && f.Relation != nil && f.Relation.RelationType == RelManyToMany
}

// RelationType for inter-collection references.
type RelationType string

const (
	RelOneToOne   RelationType = "one_to_one"
	RelOneToMany  RelationType = "one_to_many"
	RelManyToMany RelationType = "many_to_many"
)

// AccessConfig defines per-collection role-based permissions.
// Each key maps an operation to a list of allowed roles.
// RLSMode controls row-level visibility for non-owner roles:
//   - ""/"none": no row filtering (default)
//   - "creator": viewers see only rows they created
//   - "department": viewers see rows created by users in their department
//   - "subsidiary": viewers see rows created by users in their subsidiary
//   - "filter": custom field-based filters (see RLSFilters)
type AccessConfig struct {
	EntryView   []string    `json:"entry_view,omitempty"`
	EntryCreate []string    `json:"entry_create,omitempty"`
	EntryEdit   []string    `json:"entry_edit,omitempty"`
	EntryDelete []string    `json:"entry_delete,omitempty"`
	RLSMode     string      `json:"rls_mode,omitempty"`
	RLSFilters  []RLSFilter `json:"rls_filters,omitempty"`
}

// RLSFilter defines a custom field-based row filter for RLS "filter" mode.
// Field is the column slug in the dynamic table.
// Op is the comparison operator: eq, neq, in, contains.
// Value is the literal value to compare against, or a user attribute reference:
//
//	$user.id, $user.department_id, $user.subsidiary_id
type RLSFilter struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value string `json:"value"`
}

// AllowsRole checks whether the given role is allowed the specified operation.
// An empty list means all authenticated roles are allowed.
func (ac AccessConfig) AllowsRole(operation, role string) bool {
	var allowed []string
	switch operation {
	case "entry_view":
		allowed = ac.EntryView
	case "entry_create":
		allowed = ac.EntryCreate
	case "entry_edit":
		allowed = ac.EntryEdit
	case "entry_delete":
		allowed = ac.EntryDelete
	default:
		return false
	}
	if len(allowed) == 0 {
		return true // no restriction
	}
	for _, r := range allowed {
		if r == role {
			return true
		}
	}
	return false
}

// Collection is the top-level schema unit (maps to a PostgreSQL table in the data schema).
type Collection struct {
	ID             string       `json:"id"`
	Slug           string       `json:"slug"`
	Label          string       `json:"label"`
	Description    string       `json:"description,omitempty"`
	Icon           string       `json:"icon,omitempty"`
	IsSystem       bool         `json:"is_system"`
	ProcessEnabled bool         `json:"process_enabled"`
	SortOrder      int          `json:"sort_order"`
	AccessConfig   AccessConfig `json:"access_config"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	CreatedBy      string       `json:"created_by,omitempty"`
	Fields         []Field      `json:"fields,omitempty"`
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

// Transition defines a state transition in a process-enabled select field.
type Transition struct {
	From         string   `json:"from"`
	To           string   `json:"to"`
	AllowedRoles []string `json:"allowed_roles"`
}

// SelectOptionsWithTransitions extends SelectOptions with workflow transitions.
type SelectOptionsWithTransitions struct {
	Choices     []string     `json:"choices"`
	Transitions []Transition `json:"transitions,omitempty"`
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
	Slug         string          `json:"slug"`
	Label        string          `json:"label"`
	Description  string          `json:"description,omitempty"`
	Icon         string          `json:"icon,omitempty"`
	IsSystem     bool            `json:"is_system,omitempty"`
	AccessConfig *AccessConfig   `json:"access_config,omitempty"`
	Fields       []CreateFieldIn `json:"fields,omitempty"`
	CreatedBy    string          `json:"-"` // set by handler, not from JSON
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
	Label          *string       `json:"label,omitempty"`
	Description    *string       `json:"description,omitempty"`
	Icon           *string       `json:"icon,omitempty"`
	SortOrder      *int          `json:"sort_order,omitempty"`
	ProcessEnabled *bool         `json:"process_enabled,omitempty"`
	AccessConfig   *AccessConfig `json:"access_config,omitempty"`
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

// --- View ---

// View represents a saved view configuration for a collection.
type View struct {
	ID           string          `json:"id"`
	CollectionID string          `json:"collection_id"`
	Name         string          `json:"name"`
	ViewType     string          `json:"view_type"` // list, kanban, calendar, gallery
	Config       json.RawMessage `json:"config"`
	SortOrder    int             `json:"sort_order"`
	IsDefault    bool            `json:"is_default"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

type CreateViewReq struct {
	Name      string          `json:"name"`
	ViewType  string          `json:"view_type"`
	Config    json.RawMessage `json:"config,omitempty"`
	SortOrder int             `json:"sort_order"`
	IsDefault bool            `json:"is_default"`
}

type UpdateViewReq struct {
	Name      *string         `json:"name,omitempty"`
	Config    json.RawMessage `json:"config,omitempty"`
	SortOrder *int            `json:"sort_order,omitempty"`
	IsDefault *bool           `json:"is_default,omitempty"`
}

// --- Saved View ---

// SavedView persists a user's filter/sort/visibility configuration for a collection.
type SavedView struct {
	ID            string          `json:"id"`
	CollectionID  string          `json:"collection_id"`
	Name          string          `json:"name"`
	FilterConfig  json.RawMessage `json:"filter_config"`
	SortConfig    string          `json:"sort_config"`
	VisibleFields json.RawMessage `json:"visible_fields,omitempty"`
	IsDefault     bool            `json:"is_default"`
	IsPublic      bool            `json:"is_public"`
	CreatedBy     *string         `json:"created_by,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

type CreateSavedViewReq struct {
	Name          string          `json:"name"`
	FilterConfig  json.RawMessage `json:"filter_config,omitempty"`
	SortConfig    string          `json:"sort_config,omitempty"`
	VisibleFields json.RawMessage `json:"visible_fields,omitempty"`
	IsDefault     bool            `json:"is_default"`
	IsPublic      bool            `json:"is_public"`
}

type UpdateSavedViewReq struct {
	Name          *string         `json:"name,omitempty"`
	FilterConfig  json.RawMessage `json:"filter_config,omitempty"`
	SortConfig    *string         `json:"sort_config,omitempty"`
	VisibleFields json.RawMessage `json:"visible_fields,omitempty"`
	IsDefault     *bool           `json:"is_default,omitempty"`
	IsPublic      *bool           `json:"is_public,omitempty"`
}
