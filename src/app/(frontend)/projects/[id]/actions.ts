'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import config from '@payload-config'

export interface UpdateProjectData {
  name: string
  status: string
  department?: string
  client?: string
  capacityKw?: number | null
  codTarget?: string | null
}

export async function updateProject(id: string, data: UpdateProjectData) {
  const payload = await getPayload({ config })

  try {
    await payload.update({
      collection: 'projects',
      id,
      data: {
        name: data.name,
        status: data.status,
        department: data.department || undefined,
        client: data.client || undefined,
        capacityKw: data.capacityKw ?? undefined,
        codTarget: data.codTarget || undefined,
      },
    })

    revalidatePath(`/projects/${id}`)
    revalidatePath('/projects')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : '프로젝트 수정에 실패했습니다'
    return { success: false, error: message }
  }
}
