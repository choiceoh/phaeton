import type { PayloadRequest } from 'payload'

import { getExpiringDocuments } from '../lib/queries.ts'

export async function checkExpiringDocsHandler({ req }: { req: PayloadRequest }) {
  const { payload } = req
  const expiring = await getExpiringDocuments(payload)

  if (expiring.length === 0) {
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
      subject: `[Phaeton] 만료 임박 문서 ${expiring.length}건`,
      text: expiring
        .map((d) => `- ${d.project_name} / ${d.title}: ${d.days_until_expiry}일 후 만료`)
        .join('\n'),
    })
    notified++
  }

  console.warn(`[checkExpiringDocs] ${expiring.length}건 만료 임박, ${notified}명에게 알림 발송`)
  return { output: { checked: expiring.length, notified } }
}
