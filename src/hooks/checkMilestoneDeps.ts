import type { CollectionBeforeChangeHook } from 'payload'

export const checkMilestoneDeps: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  // done으로 변경 시, 이전 크리티컬 마일스톤이 모두 완료인지 확인
  if (data.status === 'done' && originalDoc?.status !== 'done') {
    const { payload } = req
    const projectId = data.project || originalDoc?.project
    const currentSeq = data.seqOrder || originalDoc?.seqOrder

    const preceding = await payload.find({
      collection: 'project-milestones',
      where: {
        and: [
          { project: { equals: projectId } },
          { seqOrder: { less_than: currentSeq } },
          { status: { not_in: ['done', 'skipped'] } },
        ],
      },
    })

    // 경고만 (차단하지 않음 — 실무에서는 순서 건너뛰기가 필요할 수 있음)
    if (preceding.docs.length > 0) {
      console.warn(
        `[Phaeton] 경고: 마일스톤 "${data.name}" 완료 처리, ` +
          `미완료 선행 항목 ${preceding.docs.length}건`,
      )
    }
  }

  return data
}
