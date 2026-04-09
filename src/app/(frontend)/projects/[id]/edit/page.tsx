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

  return (
    <ProjectEditForm
      projectId={String(project.id)}
      initial={{
        name: project.name,
        code: project.code,
        status: project.status,
        department: project.department ?? null,
        client: project.client ?? null,
        capacityKw: project.capacityKw ?? null,
        codTarget: project.codTarget ?? null,
      }}
    />
  )
}
