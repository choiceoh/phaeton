import type { CollectionBeforeChangeHook } from 'payload'

/**
 * 인력 배치 저장 전 할당률 합산을 검증한다.
 * - 합산 > 200%: 저장 차단 (ValidationError)
 * - 합산 > 100%: 경고 로그 (과할당이지만 실무상 허용)
 */
export const validateAssignment: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const { payload } = req

  const staffId =
    typeof data.staff === 'object' ? data.staff?.id : data.staff
  const startDate = data.startDate as string | undefined
  const endDate = data.endDate as string | undefined
  const allocationPct = (data.allocationPct as number) ?? 100

  if (!staffId || !startDate) return data

  // 같은 인력의 기간이 겹치는 기존 배치 조회
  const where: any = {
    and: [
      { staff: { equals: staffId } },
      { startDate: { less_than: endDate || '9999-12-31' } },
      {
        or: [
          { endDate: { exists: false } },
          { endDate: { greater_than: startDate } },
        ],
      },
    ],
  }

  // 수정 시 자기 자신 제외
  if (operation === 'update' && originalDoc?.id) {
    where.and.push({ id: { not_equals: originalDoc.id } })
  }

  const overlapping = await payload.find({
    collection: 'staff-assignments',
    where,
    limit: 100,
  })

  const existingTotal = overlapping.docs.reduce(
    (sum, doc: any) => sum + ((doc.allocationPct as number) ?? 100),
    0,
  )
  const newTotal = existingTotal + allocationPct

  if (newTotal > 200) {
    throw new Error(
      `할당률 초과: 해당 인력의 겹치는 기간 총 할당률이 ${newTotal}%입니다 (최대 200%). ` +
        `기존 ${existingTotal}% + 신규 ${allocationPct}%`,
    )
  }

  if (newTotal > 100) {
    console.warn(
      `[인력 과할당 경고] staff=${staffId} 총 할당률 ${newTotal}% (기존 ${existingTotal}% + 신규 ${allocationPct}%)`,
    )
  }

  return data
}
