/**
 * Client-side sort engine for local mode (≤1,000 rows).
 *
 * Type-aware multi-field stable sort with Korean locale collation
 * and null-last semantics.
 */

import type { EntryRow, Field, FieldType } from '@/lib/types'

export interface LocalSortItem {
  field: string
  desc: boolean
}

function compareValues(a: unknown, b: unknown, ft: FieldType): number {
  const aNullish = a == null || a === ''
  const bNullish = b == null || b === ''

  // Nulls always sort last regardless of direction
  if (aNullish && bNullish) return 0
  if (aNullish) return 1
  if (bNullish) return -1

  switch (ft) {
    case 'number':
    case 'integer':
    case 'autonumber': {
      return Number(a) - Number(b)
    }
    case 'date':
    case 'datetime':
    case 'time': {
      return new Date(a as string).getTime() - new Date(b as string).getTime()
    }
    case 'boolean': {
      const ab = a === true || a === 'true' ? 1 : 0
      const bb = b === true || b === 'true' ? 1 : 0
      return ab - bb
    }
    case 'formula': {
      // Try numeric comparison first, fall back to string
      const na = Number(a)
      const nb = Number(b)
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
      return String(a).localeCompare(String(b), 'ko')
    }
    default: {
      return String(a).localeCompare(String(b), 'ko')
    }
  }
}

export function applySort(
  rows: EntryRow[],
  sortItems: LocalSortItem[],
  fields: Field[],
): EntryRow[] {
  if (sortItems.length === 0) return rows

  const fieldMap = new Map(fields.map((f) => [f.slug, f]))

  return [...rows].sort((a, b) => {
    for (const item of sortItems) {
      const field = fieldMap.get(item.field)
      const ft: FieldType = field?.field_type ?? 'text'
      const cmp = compareValues(a[item.field], b[item.field], ft)
      if (cmp !== 0) return item.desc ? -cmp : cmp
    }
    return 0
  })
}
