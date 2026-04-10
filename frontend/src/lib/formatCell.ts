import type { Field } from '@/lib/types'

export function formatCell(value: unknown, field: Field): string {
  if (value == null) return '-'
  if (field.field_type === 'relation') {
    // M:N: array of UUIDs or expanded objects.
    if (Array.isArray(value)) {
      if (value.length === 0) return '-'
      return value.map((v) => {
        if (typeof v === 'object' && v !== null) {
          const obj = v as Record<string, unknown>
          return String(obj.name ?? obj.title ?? obj.label ?? obj.id ?? '?')
        }
        return String(v)
      }).join(', ')
    }
    // 1:1/1:N: single expanded object.
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>
      return String(obj.name ?? obj.title ?? obj.label ?? obj.id ?? '?')
    }
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
  if (field.field_type === 'table') {
    if (Array.isArray(value)) return `${value.length}행`
    return '-'
  }

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

  // Formula fields: format based on result_type in options.
  if (field.field_type === 'formula') {
    const resultType = field.options?.result_type as string | undefined
    if (resultType === 'number' || resultType === 'integer') {
      const num = Number(value)
      if (!isNaN(num)) {
        const precision = (field.options?.precision as number) ?? undefined
        return precision !== undefined
          ? num.toLocaleString('ko-KR', { minimumFractionDigits: precision, maximumFractionDigits: precision })
          : num.toLocaleString('ko-KR')
      }
    }
    if (resultType === 'boolean') return value ? '✓' : '-'
    if (resultType === 'date' && value) {
      return new Date(value as string).toLocaleDateString('ko')
    }
    return String(value)
  }

  // Rollup fields: format numbers nicely.
  if (field.field_type === 'rollup') {
    if (typeof value === 'number') return value.toLocaleString('ko-KR')
    return String(value)
  }

  // Lookup fields: may be a single value or array (from M:N).
  if (field.field_type === 'lookup') {
    if (Array.isArray(value)) return value.map(String).join(', ')
    return String(value)
  }

  return String(value)
}
