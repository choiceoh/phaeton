package automation

import (
	"encoding/json"
	"time"
)

// TriggerType constants.
const (
	TriggerRecordCreated = "record_created"
	TriggerRecordUpdated = "record_updated"
	TriggerRecordDeleted = "record_deleted"
	TriggerStatusChange  = "status_change"
	TriggerSchedule      = "schedule"
	TriggerFormSubmit    = "form_submit"
)

// ActionType constants.
const (
	ActionSendNotification = "send_notification"
	ActionUpdateField      = "update_field"
	ActionCallWebhook      = "call_webhook"
)

// Operator constants for conditions.
const (
	OpEquals     = "equals"
	OpNotEquals  = "not_equals"
	OpContains   = "contains"
	OpGT         = "gt"
	OpLT         = "lt"
	OpIsEmpty    = "is_empty"
	OpIsNotEmpty = "is_not_empty"
)

// Automation is a trigger→condition→action rule scoped to a collection.
type Automation struct {
	ID            string          `json:"id"`
	CollectionID  string          `json:"collection_id"`
	Name          string          `json:"name"`
	IsEnabled     bool            `json:"is_enabled"`
	TriggerType   string          `json:"trigger_type"`
	TriggerConfig json.RawMessage `json:"trigger_config"`
	Conditions    []Condition     `json:"conditions"`
	Actions       []Action        `json:"actions"`
	CreatedBy     string          `json:"created_by,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// Condition is a field-value comparison (all conditions are AND-joined).
type Condition struct {
	ID        string `json:"id"`
	FieldSlug string `json:"field_slug"`
	Operator  string `json:"operator"`
	Value     string `json:"value"`
	SortOrder int    `json:"sort_order"`
}

// Action is what to do when the trigger fires and conditions pass.
type Action struct {
	ID           string          `json:"id"`
	ActionType   string          `json:"action_type"`
	ActionConfig json.RawMessage `json:"action_config"`
	SortOrder    int             `json:"sort_order"`
}

// Run is an execution log entry.
type Run struct {
	ID           string    `json:"id"`
	AutomationID string    `json:"automation_id"`
	CollectionID string    `json:"collection_id"`
	RecordID     string    `json:"record_id"`
	TriggerType  string    `json:"trigger_type"`
	Status       string    `json:"status"` // success, error, skipped
	ErrorMessage string    `json:"error_message,omitempty"`
	DurationMs   int       `json:"duration_ms"`
	CreatedAt    time.Time `json:"created_at"`
}

// TriggerStatusConfig holds from/to status for status_change triggers.
type TriggerStatusConfig struct {
	FromStatus string `json:"from_status"`
	ToStatus   string `json:"to_status"`
}

// ScheduleConfig holds cron expression for schedule triggers.
type ScheduleConfig struct {
	Cron     string `json:"cron"`     // cron expression e.g. "0 9 * * *" (every day at 9am)
	Timezone string `json:"timezone"` // e.g. "Asia/Seoul"
}

// FormSubmitConfig holds optional form slug filter for form_submit triggers.
type FormSubmitConfig struct {
	FormSlug string `json:"form_slug,omitempty"` // if set, only triggers for this form
}

// NotificationConfig holds config for send_notification actions.
type NotificationConfig struct {
	Recipient string `json:"recipient"` // record_creator, specific_user, field_ref
	UserID    string `json:"user_id,omitempty"`
	FieldSlug string `json:"field_slug,omitempty"`
	Title     string `json:"title"`
	Body      string `json:"body"`
}

// UpdateFieldConfig holds config for update_field actions.
type UpdateFieldConfig struct {
	FieldSlug string `json:"field_slug"`
	Value     string `json:"value"`
}

// WebhookConfig holds config for call_webhook actions.
type WebhookConfig struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
}
