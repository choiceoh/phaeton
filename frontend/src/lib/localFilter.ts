/**
 * Client-side filter engine for local mode (≤5,000 rows).
 *
 * Evaluates FilterGroup trees against EntryRow arrays entirely in JS,
 * mirroring the server-side filter logic in backend/internal/handler/filter.go.
 */

import type { EntryRow, Field, FilterCondition, FilterGroup } from '@/lib/types'

function isNullish(val: unknown): boolean {
  return val == null || val === ''
}

function toNumber(val: unknown): number | null {
  if (val == null || val === '') return null
  const n = Number(val)
  return Number.isNaN(n) ? null : n
}

function toDateMs(val: unknown): number | null {
  if (val == null || val === '') return null
  const d = new Date(val as string)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

function evaluateCondition(
  row: EntryRow,
  cond: FilterCondition,
  fields: Field[],
): boolean {
  const field = fields.find((f) => f.slug === cond.field)
  const val = row[cond.field]
  const op = cond.operator
  const condVal = cond.value

  if (op === 'is_null') return isNullish(val)

  const ft = field?.field_type ?? 'text'

  // Numeric types
  if (ft === 'number' || ft === 'integer') {
    const a = toNumber(val)
    const b = toNumber(condVal)
    if (a == null) return false
    switch (op) {
      case 'eq': return a === b
      case 'neq': return a !== b
      case 'gt': return b != null && a > b
      case 'gte': return b != null && a >= b
      case 'lt': return b != null && a < b
      case 'lte': return b != null && a <= b
      default: return true
    }
  }

  // Date types
  if (ft === 'date' || ft === 'datetime' || ft === 'time') {
    const a = toDateMs(val)
    const b = toDateMs(condVal)
    if (a == null) return false
    switch (op) {
      case 'eq': return a === b
      case 'neq': return a !== b
      case 'gt': return b != null && a > b
      case 'gte': return b != null && a >= b
      case 'lt': return b != null && a < b
      case 'lte': return b != null && a <= b
      default: return true
    }
  }

  // Boolean
  if (ft === 'boolean') {
    const a = val === true || val === 'true'
    const b = condVal === 'true'
    switch (op) {
      case 'eq': return a === b
      case 'neq': return a !== b
      default: return true
    }
  }

  // Select
  if (ft === 'select') {
    const s = String(val ?? '')
    switch (op) {
      case 'eq': return s === condVal
      case 'neq': return s !== condVal
      case 'in': return condVal.split(',').map((v) => v.trim()).includes(s)
      default: return true
    }
  }

  // Multiselect (stored as array or comma string)
  if (ft === 'multiselect') {
    const arr = Array.isArray(val) ? val.map(String) : String(val ?? '').split(',').map((v) => v.trim())
    switch (op) {
      case 'like': return arr.some((v) => v.toLowerCase().includes(condVal.toLowerCase()))
      default: return true
    }
  }

  // Formula — compare based on result_type if available, default to text
  if (ft === 'formula') {
    const resultType = (field?.options as Record<string, unknown> | undefined)?.result_type as string | undefined
    if (resultType === 'number') {
      const a = toNumber(val)
      const b = toNumber(condVal)
      if (a == null) return false
      switch (op) {
        case 'eq': return a === b
        case 'neq': return a !== b
        case 'gt': return b != null && a > b
        case 'gte': return b != null && a >= b
        case 'lt': return b != null && a < b
        case 'lte': return b != null && a <= b
        default: return true
      }
    }
    // fall through to text comparison
  }

  // Default: text comparison
  const s = String(val ?? '').toLowerCase()
  const cv = condVal.toLowerCase()
  switch (op) {
    case 'eq': return s === cv
    case 'neq': return s !== cv
    case 'like': return s.includes(cv)
    case 'in': return condVal.split(',').map((v) => v.trim().toLowerCase()).includes(s)
    case 'gt': return s > cv
    case 'gte': return s >= cv
    case 'lt': return s < cv
    case 'lte': return s <= cv
    default: return true
  }
}

function evaluateFilterGroup(
  row: EntryRow,
  group: FilterGroup,
  fields: Field[],
): boolean {
  const condResults = group.conditions.map((c) => evaluateCondition(row, c, fields))
  const subResults = group.groups.map((g) => evaluateFilterGroup(row, g, fields))
  const all = [...condResults, ...subResults]

  if (all.length === 0) return true

  return group.logic === 'and'
    ? all.every(Boolean)
    : all.some(Boolean)
}

export function applyFilters(
  rows: EntryRow[],
  filterGroup: FilterGroup,
  fields: Field[],
): EntryRow[] {
  return rows.filter((row) => evaluateFilterGroup(row, filterGroup, fields))
}

export function applyTextSearch(
  rows: EntryRow[],
  query: string,
  fields: Field[],
): EntryRow[] {
  if (!query.trim()) return rows
  const q = query.toLowerCase()
  const textFields = fields.filter(
    (f) => f.field_type === 'text' || f.field_type === 'textarea',
  )
  return rows.filter((row) =>
    textFields.some((f) => {
      const val = row[f.slug]
      return val != null && String(val).toLowerCase().includes(q)
    }),
  )
}
