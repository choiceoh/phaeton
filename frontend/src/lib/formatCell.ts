import type { Field } from '@/lib/types'

export function formatCell(value: unknown, field: Field): string {
  if (value == null) return '-'
  if (field.field_type === 'relation' && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return String(obj.name ?? obj.title ?? obj.label ?? obj.id ?? '?')
  }
  if (field.field_type === 'boolean') return value ? '✓' : '-'
  if (field.field_type === 'date' || field.field_type === 'datetime') {
    return new Date(value as string).toLocaleDateString('ko')
  }
  if (field.field_type === 'multiselect' && Array.isArray(value)) {
    return value.join(', ')
  }
  if (field.field_type === 'json') return JSON.stringify(value)
  return String(value)
}
