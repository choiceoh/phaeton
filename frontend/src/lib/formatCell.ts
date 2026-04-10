import type { Field } from '@/lib/types'

export function formatCell(value: unknown, field: Field): string {
  if (value == null) return '-'
  if (field.field_type === 'relation' && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return String(obj.name ?? obj.title ?? obj.label ?? obj.id ?? '?')
  }
  if (field.field_type === 'user' && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return String(obj.name ?? obj.email ?? obj.id ?? '?')
  }
  if (field.field_type === 'boolean') return value ? '✓' : '-'
  if (field.field_type === 'date' || field.field_type === 'datetime') {
    return new Date(value as string).toLocaleDateString('ko')
  }
  if (field.field_type === 'time') return String(value)
  if (field.field_type === 'multiselect' && Array.isArray(value)) {
    return value.join(', ')
  }
  if (field.field_type === 'textarea') {
    const s = String(value)
    return s.length > 100 ? s.slice(0, 100) + '...' : s
  }
  if (field.field_type === 'json') return JSON.stringify(value)

  const displayType = field.options?.display_type as string | undefined

  // Number display subtypes
  if ((field.field_type === 'number' || field.field_type === 'integer') && displayType) {
    const num = Number(value)
    if (displayType === 'currency') {
      const code = (field.options?.currency_code as string) || 'KRW'
      try {
        return num.toLocaleString('ko-KR', { style: 'currency', currency: code })
      } catch {
        return `${code} ${num.toLocaleString('ko-KR')}`
      }
    }
    if (displayType === 'percent') return `${num}%`
    if (displayType === 'rating') {
      const max = (field.options?.max_rating as number) || 5
      return '★'.repeat(Math.min(num, max)) + '☆'.repeat(Math.max(0, max - num))
    }
    if (displayType === 'progress') return `${num}%`
  }

  // Text display subtypes
  if (field.field_type === 'text' && displayType) {
    const s = String(value)
    if (displayType === 'url') return s
    if (displayType === 'email') return s
    if (displayType === 'phone') return s
  }

  if (field.field_type === 'autonumber') return String(value)

  return String(value)
}
