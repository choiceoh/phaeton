import { z } from 'zod'

/** 양의 정수 (limit, offset 등 페이지네이션용) */
export const positiveInt = z.coerce.number().int().positive()

/** 0 이상 정수 (offset 등) */
export const nonNegativeInt = z.coerce.number().int().nonnegative()

/** searchParams에서 선택적 limit 파싱 */
export function parseLimit(searchParams: URLSearchParams, fallback?: number) {
  const raw = searchParams.get('limit')
  if (raw === null) return fallback
  const result = positiveInt.safeParse(raw)
  return result.success ? result.data : fallback
}
