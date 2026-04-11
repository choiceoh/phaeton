/**
 * coercion.ts — Type coercion for free-grid save pipeline.
 *
 * During editing, cells accept any value. On save, values are coerced
 * to match the field's declared type. If coercion fails, an error
 * message is returned so the UI can highlight the cell.
 */

import type { Field, SelectFieldOptions, MultiselectFieldOptions } from './types'

export interface CoercionResult {
  value: unknown
  success: boolean
  error?: string
}

/**
 * Parse a date string from various formats (Excel, Korean, ISO, US).
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
export function parseDateFlexible(raw: string): string | null {
  // ISO: 2024-03-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // Korean dot: 2024.03.15
  const dotMatch = raw.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/)
  if (dotMatch) {
    return `${dotMatch[1]}-${dotMatch[2].padStart(2, '0')}-${dotMatch[3].padStart(2, '0')}`
  }
  // Korean text: 2024년 3월 15일
  const koMatch = raw.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/)
  if (koMatch) {
    return `${koMatch[1]}-${koMatch[2].padStart(2, '0')}-${koMatch[3].padStart(2, '0')}`
  }
  // US format: 3/15/2024 or 03/15/2024
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`
  }
  // ISO datetime: 2024-03-15T09:00:00
  const dtMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ]/)
  if (dtMatch) return dtMatch[1]
  return null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Coerce a raw cell value to the field's declared type for saving.
 *
 * Returns { value, success, error? }. On success, `value` is the
 * coerced result. On failure, `error` describes the problem.
 */
export function coerceForSave(raw: unknown, field: Field): CoercionResult {
  // null / undefined / empty string → null (clear the cell)
  if (raw == null || raw === '') {
    return { value: null, success: true }
  }

  const str = typeof raw === 'string' ? raw : String(raw)

  switch (field.field_type) {
    case 'text':
    case 'textarea':
      return { value: str, success: true }

    case 'number': {
      if (typeof raw === 'number') return { value: raw, success: true }
      const cleaned = str.replace(/[,₩$€¥\s]/g, '').replace(/%$/, '')
      const n = parseFloat(cleaned)
      if (isNaN(n)) return { value: null, success: false, error: '숫자 형식이 아닙니다' }
      return { value: n, success: true }
    }

    case 'integer': {
      if (typeof raw === 'number') return { value: Math.round(raw), success: true }
      const cleaned = str.replace(/[,₩$€¥\s]/g, '')
      const n = parseInt(cleaned, 10)
      if (isNaN(n)) return { value: null, success: false, error: '정수 형식이 아닙니다' }
      return { value: n, success: true }
    }

    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw, success: true }
      const lower = str.toLowerCase().trim()
      if (['true', '1', '✓', '참', 'yes', 'y'].includes(lower)) return { value: true, success: true }
      if (['false', '0', '✗', '거짓', 'no', 'n', ''].includes(lower)) return { value: false, success: true }
      return { value: null, success: false, error: 'true/false 형식이 아닙니다' }
    }

    case 'date': {
      const parsed = parseDateFlexible(str)
      if (!parsed) return { value: null, success: false, error: '날짜 형식이 아닙니다' }
      return { value: parsed, success: true }
    }

    case 'datetime': {
      // Full datetime
      if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(str)) return { value: str, success: true }
      // Date-only → append midnight
      const parsed = parseDateFlexible(str)
      if (parsed) return { value: `${parsed}T00:00:00Z`, success: true }
      return { value: null, success: false, error: '날짜/시간 형식이 아닙니다' }
    }

    case 'time': {
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str.trim())) return { value: str.trim(), success: true }
      return { value: null, success: false, error: '시간 형식이 아닙니다 (HH:MM)' }
    }

    case 'select': {
      const opts = field.options as SelectFieldOptions | undefined
      const choices = opts?.choices ?? []
      if (choices.length > 0 && !choices.includes(str)) {
        return { value: null, success: false, error: `선택지에 없는 값: ${str}` }
      }
      return { value: str, success: true }
    }

    case 'multiselect': {
      const opts = field.options as MultiselectFieldOptions | undefined
      const choices = opts?.choices ?? []
      const arr = Array.isArray(raw) ? raw : str.split(',').map((s) => s.trim()).filter(Boolean)
      if (choices.length > 0) {
        const invalid = arr.filter((v: unknown) => !choices.includes(String(v)))
        if (invalid.length > 0) {
          return { value: null, success: false, error: `선택지에 없는 값: ${invalid.join(', ')}` }
        }
      }
      return { value: arr, success: true }
    }

    case 'relation':
    case 'user': {
      // Accept UUID strings or expanded objects with id
      if (typeof raw === 'object' && raw !== null && 'id' in raw) {
        return { value: (raw as Record<string, unknown>).id, success: true }
      }
      if (UUID_RE.test(str)) return { value: str, success: true }
      return { value: null, success: false, error: 'UUID 형식이 아닙니다' }
    }

    case 'json': {
      if (typeof raw === 'object') return { value: raw, success: true }
      try {
        return { value: JSON.parse(str), success: true }
      } catch {
        return { value: null, success: false, error: 'JSON 형식이 아닙니다' }
      }
    }

    // autonumber, file, table, spreadsheet — pass through
    default:
      return { value: raw, success: true }
  }
}

/**
 * Simple coercion for paste operations (no error reporting).
 * Kept for backward compatibility with SpreadsheetView paste handler.
 */
export function coerceValue(raw: string, field: Field): unknown {
  if (raw === '') return null
  switch (field.field_type) {
    case 'number': {
      const cleaned = raw.replace(/[,₩$€¥\s]/g, '').replace(/%$/, '')
      const n = parseFloat(cleaned)
      return isNaN(n) ? null : n
    }
    case 'integer': {
      const cleaned = raw.replace(/[,₩$€¥\s]/g, '')
      const n = parseInt(cleaned, 10)
      return isNaN(n) ? null : n
    }
    case 'boolean':
      return ['true', '1', '✓', '참', 'yes', 'y'].includes(raw.toLowerCase())
    case 'date': {
      const parsed = parseDateFlexible(raw)
      return parsed ?? raw
    }
    case 'datetime': {
      if (/^\d{4}-\d{2}-\d{2}[T ]/.test(raw)) return raw
      const parsed = parseDateFlexible(raw)
      return parsed ?? raw
    }
    case 'time':
      return raw
    case 'multiselect':
      return raw.split(',').map((s) => s.trim()).filter(Boolean)
    default:
      return raw
  }
}
