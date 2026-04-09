import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { ChatContextSetter } from '@/components/ChatContextSetter'
import { ProjectDetailView } from '@/components/ProjectDetailView'

import config from '@payload-config'

export const revalidate = 10

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })

  let project
  try {
    project = await payload.findByID({ collection: 'projects', id })
  } catch {
    notFound()
  }

  let user: { role?: string } | null = null
  try {
    const result = await payload.auth({ headers: await headers() })
    user = result.user as { role?: string } | null
  } catch {
    /* 개발 단계 */
  }

  const canEdit = ['director', 'pm'].includes(user?.role as string)

  const [milestonesRes, assignmentsRes, docsRes, allStaffRes] = await Promise.all([
    payload.find({
      collection: 'project-milestones',
      where: { project: { equals: id } },
      sort: 'seqOrder',
      depth: 1,
      limit: 100,
    }),
    payload.find({
      collection: 'staff-assignments',
      where: { project: { equals: id } },
      depth: 1,
      limit: 100,
    }),
    payload.find({
      collection: 'project-documents',
      where: { project: { equals: id } },
      limit: 100,
    }),
    canEdit
      ? payload.find({
          collection: 'staff',
          where: { isActive: { equals: true } },
          limit: 500,
        })
      : Promise.resolve({ docs: [] }),
  ])

  const milestones = milestonesRes.docs.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    plannedDate: m.plannedDate ?? null,
    actualDate: m.actualDate ?? null,
    dueDate: m.dueDate ?? null,
    seqOrder: m.seqOrder,
    assignee:
      m.assignee && typeof m.assignee === 'object'
        ? {
            id: (m.assignee as { id: number; name: string }).id,
            name: (m.assignee as { id: number; name: string }).name,
          }
        : null,
    template:
      m.template && typeof m.template === 'object'
        ? { category: (m.template as { category: string }).category }
        : null,
    note: m.note ?? null,
  }))

  const staffList = allStaffRes.docs.map((s) => ({
    id: s.id as number,
    name: s.name,
  }))

  const chatContext = [
    `프로젝트: ${project.name} (${project.code})`,
    `유형: ${project.type}, 상태: ${project.status}`,
    `마일스톤: ${milestones.length}개 중 ${milestones.filter((m) => m.status === 'done').length}개 완료`,
  ].join('\n')

  return (
    <>
      <ChatContextSetter context={chatContext} />
      <ProjectDetailView
        project={{
          id: String(project.id),
          name: project.name,
          code: project.code,
          type: project.type,
          status: project.status,
          capacityKw: project.capacityKw ?? null,
          codTarget: project.codTarget ?? null,
          client: project.client ?? null,
        }}
        milestones={milestones}
        assignments={assignmentsRes.docs.map((a) => ({
          id: a.id,
          staff:
            typeof a.staff === 'object' && a.staff
              ? {
                  id: (a.staff as { id: number; name: string }).id,
                  name: (a.staff as { id: number; name: string }).name,
                }
              : null,
          roleOnProject: a.roleOnProject ?? null,
          allocationPct: a.allocationPct ?? null,
          startDate: a.startDate ?? null,
          endDate: a.endDate ?? null,
        }))}
        documents={docsRes.docs.map((d) => ({
          id: d.id,
          title: d.title,
          docType: d.docType,
          expiryDate: d.expiryDate ?? null,
        }))}
        staffList={staffList}
        canEdit={canEdit}
      />
    </>
  )
}
