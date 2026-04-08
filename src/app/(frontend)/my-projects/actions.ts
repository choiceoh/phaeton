'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'

const NEXT_STATUS: Record<string, string> = {
  pending: 'active',
  active: 'done',
}

export async function advanceMilestone(milestoneId: number) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }

  const milestone = await payload.findByID({
    collection: 'project-milestones',
    id: milestoneId,
  })

  const nextStatus = NEXT_STATUS[milestone.status]
  if (!nextStatus) {
    return { error: '이 마일스톤은 더 이상 진행할 수 없습니다.' }
  }

  // 현재 유저가 이 프로젝트에 배치되었는지 확인
  const staffRes = await payload.find({
    collection: 'staff',
    where: { user: { equals: user.id } },
    limit: 1,
  })
  if (staffRes.docs.length === 0) {
    return { error: '인력 정보가 없습니다.' }
  }

  const staffId = staffRes.docs[0].id
  const today = new Date().toISOString().split('T')[0]

  const assignmentRes = await payload.find({
    collection: 'staff-assignments',
    where: {
      and: [
        { staff: { equals: staffId } },
        { project: { equals: milestone.project } },
        { startDate: { less_than_equal: today } },
        {
          or: [
            { endDate: { exists: false } },
            { endDate: { greater_than_equal: today } },
          ],
        },
      ],
    },
    limit: 1,
  })

  if (assignmentRes.docs.length === 0) {
    return { error: '이 프로젝트에 배치되지 않았습니다.' }
  }

  const updateData: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === 'done') {
    updateData.actualDate = today
  }

  await payload.update({
    collection: 'project-milestones',
    id: milestoneId,
    data: updateData,
  })

  return {
    ok: true,
    newStatus: nextStatus,
    milestoneName: milestone.name,
  }
}
