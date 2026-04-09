'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'

export interface CreateProjectData {
  name: string
  type: string
  status?: string
  department?: string
  assignedPM?: number | null
  client?: string
  capacityKw?: number | null
  codTarget?: string | null
}

export async function createProject(data: CreateProjectData) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }
  if (!['director', 'pm'].includes(user.role as string)) {
    return { error: '프로젝트 생성 권한이 없습니다.' }
  }

  try {
    const project = await payload.create({
      collection: 'projects',
      data: {
        name: data.name,
        type: data.type,
        status: data.status || 'gen-permit',
        department: data.department || undefined,
        assignedPM: data.assignedPM ?? undefined,
        client: data.client || undefined,
        capacityKw: data.capacityKw ?? undefined,
        codTarget: data.codTarget || undefined,
      },
    })

    return { ok: true, id: String(project.id) }
  } catch (err) {
    const message = err instanceof Error ? err.message : '프로젝트 생성에 실패했습니다'
    return { error: message }
  }
}
