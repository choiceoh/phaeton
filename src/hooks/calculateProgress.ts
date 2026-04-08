import type { CollectionAfterReadHook } from 'payload'

export const calculateProgress: CollectionAfterReadHook = async ({
  doc,
  req: { payload },
}) => {
  const milestones = await payload.find({
    collection: 'project-milestones',
    where: { project: { equals: doc.id } },
    limit: 0,
    pagination: false,
  })

  const total = milestones.docs.length
  const done = milestones.docs.filter((m: any) => m.status === 'done').length
  doc.progressPct = total > 0 ? Math.round((done / total) * 100) : 0

  return doc
}
