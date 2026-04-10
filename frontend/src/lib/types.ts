// Field types supported by the schema engine.
export type FieldType =
  | 'text'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'relation'
  | 'file'
  | 'json'

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
  sort_order: number
  created_at: string
  updated_at: string
  relation?: Relation
}

export interface Collection {
  id: string
  slug: string
  label: string
  description?: string
  icon?: string
  is_system: boolean
  sort_order: number
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
