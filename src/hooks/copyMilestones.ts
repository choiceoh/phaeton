import type { CollectionAfterChangeHook } from 'payload'

export const copyMilestones: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc

  const { payload } = req
  const projectType = doc.type

  // hybrid: solar 템플릿 기반 + ESS 특화 3개 추가
  const typesToFetch = projectType === 'hybrid' ? ['solar'] : [projectType]

  for (const type of typesToFetch) {
    const templates = await payload.find({
      collection: 'milestone-templates',
      where: { projectType: { equals: type } },
      sort: 'seqOrder',
      limit: 100,
    })

    await Promise.all(
      templates.docs.map((tmpl) =>
        payload.create({
          collection: 'project-milestones',
          req,
          data: {
            project: doc.id,
            template: tmpl.id,
            name: tmpl.name,
            seqOrder: tmpl.seqOrder,
            status: 'pending',
          },
        }),
      ),
    )
  }

  // hybrid: ESS 특화 마일스톤 추가
  if (projectType === 'hybrid') {
    const essExtras = await payload.find({
      collection: 'milestone-templates',
      where: {
        and: [
          { projectType: { equals: 'ess' } },
          { name: { in: ['소방시설 심의', '배터리·PCS 발주', '전력거래소 등록'] } },
        ],
      },
      sort: 'seqOrder',
    })

    const seq = 100
    await Promise.all(
      essExtras.docs.map((tmpl) =>
        payload.create({
          collection: 'project-milestones',
          req,
          data: {
            project: doc.id,
            template: tmpl.id,
            name: tmpl.name,
            seqOrder: seq + tmpl.seqOrder,
            status: 'pending',
          },
        }),
      ),
    )
  }

  return doc
}
