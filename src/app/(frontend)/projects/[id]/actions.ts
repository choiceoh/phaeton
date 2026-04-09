'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'

export interface UpdateProjectData {
  name: string
  type: string
  status: string
  department?: string
  assignedPM?: number | null
  client?: string
  // 현장·설비
  capacityKw?: number | null
  site?: {
    address?: string
    region?: string
    landAreaM2?: number | null
    landType?: string
    coordinates?: { lat?: number | null; lng?: number | null }
  }
  // 태양광
  moduleCount?: number | null
  moduleType?: string
  inverterCapacityKw?: number | null
  // 풍력
  turbineCount?: number | null
  turbineModel?: string
  hubHeightM?: number | null
  // ESS
  batteryCapacityKwh?: number | null
  pcsCapacityKw?: number | null
  // 일정
  codTarget?: string | null
  codActual?: string | null
  // 재무
  epcValue?: number | null
}

export async function updateProject(id: string, data: UpdateProjectData) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  try {
    const updateData: Record<string, unknown> = {
      name: data.name,
      type: data.type,
      status: data.status,
      department: data.department || undefined,
      assignedPM: data.assignedPM ?? undefined,
      client: data.client || undefined,
      capacityKw: data.capacityKw ?? undefined,
      site: data.site ?? undefined,
      moduleCount: data.moduleCount ?? undefined,
      moduleType: data.moduleType || undefined,
      inverterCapacityKw: data.inverterCapacityKw ?? undefined,
      turbineCount: data.turbineCount ?? undefined,
      turbineModel: data.turbineModel || undefined,
      hubHeightM: data.hubHeightM ?? undefined,
      batteryCapacityKwh: data.batteryCapacityKwh ?? undefined,
      pcsCapacityKw: data.pcsCapacityKw ?? undefined,
      codTarget: data.codTarget || undefined,
      codActual: data.codActual || undefined,
    }

    if (data.epcValue !== undefined && user?.role === 'director') {
      updateData.epcValue = data.epcValue
    }

    await payload.update({ collection: 'projects', id, data: updateData })

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
  const issueDate = formData.get('issueDate') as string
  if (issueDate) data.issueDate = issueDate
  const issuedBy = formData.get('issuedBy') as string
  if (issuedBy) data.issuedBy = issuedBy
  const note = formData.get('note') as string
  if (note) data.note = note

  const createOpts = { collection: 'project-documents' as const, data }

  const file = formData.get('file') as File | null
  // Payload upload API requires non-standard call signature
  const create = payload.create as (...args: unknown[]) => Promise<unknown>

  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer())
    await create({
      ...createOpts,
      file: {
        data: buffer,
        mimetype: file.type,
        name: file.name,
        size: file.size,
      },
    })
  } else {
    await create(createOpts)
  }

  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

/* ── 마일스톤 CRUD ─────────────────────────────────────── */

export interface MilestoneFormData {
  name: string
  plannedDate?: string | null
  dueDate?: string | null
  assignee?: number | null
  note?: string
  status?: string
}

export async function createMilestone(projectId: string, data: MilestoneFormData) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }
  if (!['director', 'pm'].includes(user.role as string)) {
    return { error: '마일스톤 생성 권한이 없습니다.' }
  }

  const existing = await payload.find({
    collection: 'project-milestones',
    where: { project: { equals: projectId } },
    sort: '-seqOrder',
    limit: 1,
  })
  const nextSeq = existing.docs.length > 0 ? (existing.docs[0].seqOrder ?? 0) + 1 : 1

  await payload.create({
    collection: 'project-milestones',
    data: {
      project: Number(projectId),
      name: data.name,
      seqOrder: nextSeq,
      status: data.status || 'pending',
      plannedDate: data.plannedDate || undefined,
      dueDate: data.dueDate || undefined,
      assignee: data.assignee ?? undefined,
      note: data.note || undefined,
    },
  })

  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

export async function updateMilestone(milestoneId: number, data: MilestoneFormData) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }

  const milestone = await payload.findByID({
    collection: 'project-milestones',
    id: milestoneId,
  })

  await payload.update({
    collection: 'project-milestones',
    id: milestoneId,
    data: {
      name: data.name,
      status: data.status || milestone.status,
      plannedDate: data.plannedDate || undefined,
      dueDate: data.dueDate || undefined,
      assignee: data.assignee ?? undefined,
      note: data.note || undefined,
    },
  })

  const projectId =
    typeof milestone.project === 'object'
      ? (milestone.project as { id: number }).id
      : milestone.project
  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

export async function deleteMilestone(milestoneId: number) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }
  if (!['director', 'pm'].includes(user.role as string)) {
    return { error: '마일스톤 삭제 권한이 없습니다.' }
  }

  const milestone = await payload.findByID({
    collection: 'project-milestones',
    id: milestoneId,
  })

  await payload.delete({ collection: 'project-milestones', id: milestoneId })

  const projectId =
    typeof milestone.project === 'object'
      ? (milestone.project as { id: number }).id
      : milestone.project
  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

/* ── 인력 배정 CRUD ────────────────────────────────────── */

export interface AssignmentFormData {
  staff: number
  roleOnProject?: string
  startDate: string
  endDate?: string | null
  allocationPct?: number
  note?: string
}

export async function createAssignment(projectId: string, data: AssignmentFormData) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }
  if (!['director', 'pm'].includes(user.role as string)) {
    return { error: '인력 배정 권한이 없습니다.' }
  }

  try {
    await payload.create({
      collection: 'staff-assignments',
      data: {
        project: Number(projectId),
        staff: data.staff,
        roleOnProject: data.roleOnProject || undefined,
        startDate: data.startDate,
        endDate: data.endDate || undefined,
        allocationPct: data.allocationPct ?? 100,
        note: data.note || undefined,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '인력 배정에 실패했습니다'
    return { error: message }
  }

  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

export async function deleteAssignment(assignmentId: number, projectId: string) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }
  if (!['director', 'pm'].includes(user.role as string)) {
    return { error: '인력 배정 삭제 권한이 없습니다.' }
  }

  await payload.delete({ collection: 'staff-assignments', id: assignmentId })
  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}
