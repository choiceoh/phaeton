import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { ProjectEditForm } from '@/components/ProjectEditForm'

import config from '@payload-config'

export const revalidate = 10

export default async function ProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })

  let project
  try {
    project = await payload.findByID({ collection: 'projects', id })
  } catch {
    notFound()
  }

  let userRole = 'viewer'
  try {
    const { user } = await payload.auth({ headers: await headers() })
    if (user?.role) userRole = user.role as string
  } catch {
    /* 개발 단계 */
  }

  const pmUsersRes = await payload.find({
    collection: 'users',
    where: { role: { in: ['director', 'pm'] } },
    limit: 100,
  })

  const pmUsers = pmUsersRes.docs.map((u) => ({
    id: u.id as number,
    name: u.name,
  }))

  type Ref = { id: number }
  type Site = {
    address?: string
    region?: string
    landAreaM2?: number
    landType?: string
    coordinates?: { lat?: number; lng?: number }
  }

  const pmId = project.assignedPM
    ? typeof project.assignedPM === 'object'
      ? (project.assignedPM as Ref).id
      : project.assignedPM
    : null

  const site = project.site as Site | undefined

  return (
    <ProjectEditForm
      projectId={String(project.id)}
      pmUsers={pmUsers}
      userRole={userRole}
      initial={{
        name: project.name,
        code: project.code,
        type: project.type,
        status: project.status,
        department: project.department ?? null,
        assignedPM: pmId,
        client: project.client ?? null,
        capacityKw: project.capacityKw ?? null,
        codTarget: project.codTarget ?? null,
        codActual: project.codActual ?? null,
        epcValue: project.epcValue ?? null,
        site: site
          ? {
              address: site.address ?? null,
              region: site.region ?? null,
              landAreaM2: site.landAreaM2 ?? null,
              landType: site.landType ?? null,
              coordinates: site.coordinates ?? null,
            }
          : null,
        moduleCount: project.moduleCount ?? null,
        moduleType: project.moduleType ?? null,
        inverterCapacityKw: project.inverterCapacityKw ?? null,
        turbineCount: project.turbineCount ?? null,
        turbineModel: project.turbineModel ?? null,
        hubHeightM: project.hubHeightM ?? null,
        batteryCapacityKwh: project.batteryCapacityKwh ?? null,
        pcsCapacityKw: project.pcsCapacityKw ?? null,
      }}
    />
  )
}
