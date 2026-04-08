import type { PayloadRequest } from 'payload'

import { getOverdueMilestones } from '../lib/queries.ts'

export async function checkOverdueHandler({ req }: { req: PayloadRequest }) {
  const { payload } = req
  const overdue = await getOverdueMilestones(payload)

  if (overdue.length === 0) {
    return { output: { checked: 0, notified: 0 } }
  }

  const directors = await payload.find({
    collection: 'users',
    where: { role: { equals: 'director' } },
    limit: 100,
  })

  let notified = 0
  for (const director of directors.docs) {
    if (!director.email) continue
    await payload.sendEmail({
      to: director.email,
      subject: `[Phaeton] 지연 마일스톤 ${overdue.length}건`,
      text: overdue
        .map(
          (m) =>
            `- ${m.project_name} / ${m.name}: ${m.days_overdue}일 지연`,
        )
        .join('\n'),
    })
    notified++
  }

  console.warn(
    `[checkOverdue] ${overdue.length}건 지연, ${notified}명에게 알림 발송`,
  )
  return { output: { checked: overdue.length, notified } }
}
