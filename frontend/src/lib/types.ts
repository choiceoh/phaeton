// Field types supported by the schema engine.
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'multiselect'
  | 'relation'
  | 'user'
  | 'file'
  | 'json'
  | 'autonumber'
  | 'formula'
  | 'lookup'
  | 'rollup'
  | 'label'
  | 'line'
  | 'spacer'

export type RelationType = 'one_to_one' | 'one_to_many' | 'many_to_many'

export interface Relation {
  id: string
  field_id: string
  target_collection_id: string
  relation_type: RelationType
  junction_table?: string
  on_delete: string
}

export interface Field {
  id: string
  collection_id: string
  slug: string
  label: string
  field_type: FieldType
  is_required: boolean
  is_unique: boolean
  is_indexed: boolean
  default_value?: unknown
  options?: Record<string, unknown>
  width: number
  height: number
  sort_order: number
  is_layout?: boolean
  created_at: string
  updated_at: string
  relation?: Relation
}

export interface AccessConfig {
  entry_view?: string[]
  entry_create?: string[]
  entry_edit?: string[]
  entry_delete?: string[]
}

export interface Collection {
  id: string
  slug: string
  label: string
  description?: string
  icon?: string
  is_system: boolean
  process_enabled: boolean
  sort_order: number
  access_config: AccessConfig
  created_at: string
  updated_at: string
  created_by?: string
  fields?: Field[]
}

export interface User {
  id: string
  email: string
  name: string
  role: 'director' | 'pm' | 'engineer' | 'viewer'
  is_active: boolean
  department_id?: string | null
  position: string
  title: string
  phone: string
  avatar: string
  joined_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface Department {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// --- Request payloads ---

export interface CreateFieldIn {
  slug: string
  label: string
  field_type: FieldType
  is_required?: boolean
  is_unique?: boolean
  is_indexed?: boolean
  default_value?: unknown
  options?: Record<string, unknown>
  width?: number
  height?: number
  relation?: {
    target_collection_id: string
    relation_type: RelationType
    junction_table?: string
    on_delete?: string
  }
}

export interface CreateCollectionReq {
  slug: string
  label: string
  description?: string
  icon?: string
  fields?: CreateFieldIn[]
}

// --- Schema migration preview ---

export type SafetyLevel = 'SAFE' | 'CAUTIOUS' | 'DANGEROUS'

export interface Preview {
  safety_level: SafetyLevel
  description: string
  affected_rows: number
  incompatible_rows?: number
  incompatible_sample?: Record<string, unknown>[]
  ddl_up: string
  ddl_down: string
  warnings?: string[]
}

// --- Process (workflow) ---

export interface ProcessStatus {
  id: string
  process_id: string
  name: string
  color: string
  sort_order: number
  is_initial: boolean
}

export interface ProcessTransition {
  id: string
  process_id: string
  from_status_id: string
  to_status_id: string
  label: string
}

export interface Process {
  id: string
  collection_id: string
  is_enabled: boolean
  statuses: ProcessStatus[]
  transitions: ProcessTransition[]
}

export interface SaveProcessReq {
  is_enabled: boolean
  statuses: { name: string; color: string; sort_order: number; is_initial: boolean }[]
  transitions: { from_index: number; to_index: number; label: string }[]
}

// --- Filter condition (frontend-only) ---

export interface FilterCondition {
  id: string
  field: string // field slug
  operator: string // eq, neq, gt, gte, lt, lte, like, in, is_null
  value: string
}

// --- Aggregate response ---

export interface AggregateResult {
  group: string
  value: number
}

// --- Views ---

export type ViewType = 'list' | 'kanban' | 'calendar' | 'gallery'

export interface View {
  id: string
  collection_id: string
  name: string
  view_type: ViewType
  config: Record<string, unknown>
  sort_order: number
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface CreateViewReq {
  name: string
  view_type: ViewType
  config?: Record<string, unknown>
  sort_order?: number
  is_default?: boolean
}

export interface UpdateViewReq {
  name?: string
  config?: Record<string, unknown>
  sort_order?: number
  is_default?: boolean
}

// --- Comments ---

export interface Comment {
  id: string
  collection_id: string
  record_id: string
  user_id: string
  user_name: string
  body: string
  created_at: string
  updated_at: string
}

// --- Notifications ---

export interface Notification {
  id: string
  user_id: string
  type: 'comment' | 'state_change' | 'record_update'
  title: string
  body?: string
  ref_collection_id?: string
  ref_record_id?: string
  is_read: boolean
  created_at: string
}

// --- Collection members ---

export interface CollectionMember {
  id: string
  collection_id: string
  user_id: string
  user_name?: string
  user_email?: string
  role: 'owner' | 'editor' | 'viewer'
  created_at: string
}

// --- Process transitions ---

export interface Transition {
  from: string
  to: string
  allowed_roles: string[]
}

// --- Change history ---

export interface RecordChange {
  id: string
  collection_id: string
  record_id: string
  user_id?: string
  user_name?: string
  operation: 'create' | 'update' | 'delete'
  diff: Record<string, { old?: unknown, new?: unknown }>
  created_at: string
}

// --- Saved views ---

export interface SavedView {
  id: string
  collection_id: string
  name: string
  filter_config: Record<string, string>
  sort_config: string
  visible_fields?: string[]
  is_default: boolean
  is_public: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

// --- Envelope responses ---

export interface DataEnvelope<T> {
  data: T
  error?: string
}

export interface ListEnvelope<T> {
  data: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}
