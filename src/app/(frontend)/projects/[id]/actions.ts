'use server'

import { headers } from 'next/headers'
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

export async function uploadDocument(formData: FormData) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }

  const projectId = formData.get('projectId') as string
  const title = formData.get('title') as string
  const docType = formData.get('docType') as string
  const file = formData.get('file') as File | null

  if (!projectId || !title || !docType) {
    return { error: '필수 항목을 모두 입력해 주세요.' }
  }

  const data: Record<string, unknown> = {
    project: Number(projectId),
    title,
    docType,
  }

  const expiryDate = formData.get('expiryDate') as string
  if (expiryDate) data.expiryDate = expiryDate

  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer())
    await payload.create({
      collection: 'project-documents',
      data,
      file: {
        data: buffer,
        mimetype: file.type,
        name: file.name,
        size: file.size,
      },
    })
  } else {
    await payload.create({
      collection: 'project-documents',
      data,
    })
  }

  return { ok: true }
}
