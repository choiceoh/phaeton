import type { Payload } from 'payload'

import { seedMilestoneTemplates } from './milestones'

// 날짜 헬퍼: 오늘 기준 ±days
function d(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

type ProjectStatus =
  | 'gen-permit'
  | 'dev-permit'
  | 'civil'
  | 'structural-elec'
  | 'inspection'
  | 'pre-cod'

export async function seed(payload: Payload) {
  // 이미 데이터가 있으면 스킵
  const existing = await payload.find({ collection: 'projects', limit: 1 })
  if (existing.totalDocs > 0) {
    console.warn('[Seed] 데이터가 이미 존재합니다. 스킵합니다.')
    return
  }

  console.warn('[Seed] 시드 데이터 생성 시작...')

  // 1. 마일스톤 템플릿
  await seedMilestoneTemplates(payload)

  // 2. 프로젝트 (site는 group 필드로 인라인, afterChange hook이 마일스톤 자동 생성)
  const projectData: {
    name: string
    code: string
    type: 'solar' | 'rooftop' | 'ess' | 'hybrid'
    capacityKw: number
    status: ProjectStatus
    client: string
    epcValue: number
    codTarget: string
    site: { address: string; region: string; landAreaM2: number; landType: string }
  }[] = [
    {
      name: '영암 100MW 태양광',
      code: 'SL-2024-001',
      type: 'solar',
      capacityKw: 100000,
      status: 'civil',
      client: '한국남부발전',
      epcValue: 120000000000,
      codTarget: d(90),
      site: { address: '전남 영암군 삼호읍', region: '전남', landAreaM2: 150000, landType: '답' },
    },
    {
      name: '수원 3MW 루프탑',
      code: 'RT-2025-001',
      type: 'rooftop',
      capacityKw: 3000,
      status: 'dev-permit',
      client: '한국서부발전',
      epcValue: 45000000000,
      codTarget: d(365),
      site: { address: '경기 수원시 권선구', region: '경기', landAreaM2: 15000, landType: '대' },
    },
    {
      name: '당진 50MWh ESS',
      code: 'ES-2025-001',
      type: 'ess',
      capacityKw: 50000,
      status: 'structural-elec',
      client: '한국중부발전',
      epcValue: 30000000000,
      codTarget: d(60),
      site: { address: '충남 당진시 석문면', region: '충남', landAreaM2: 5000, landType: '대' },
    },
    {
      name: '김제 30MW 태양광',
      code: 'SL-2025-002',
      type: 'solar',
      capacityKw: 30000,
      status: 'dev-permit',
      client: '김제시',
      epcValue: 35000000000,
      codTarget: d(200),
      site: { address: '전북 김제시 광활면', region: '전북', landAreaM2: 80000, landType: '전' },
    },
    {
      name: '신안 200MW 태양광',
      code: 'SL-2025-003',
      type: 'solar',
      capacityKw: 200000,
      status: 'gen-permit',
      client: '한국전력',
      epcValue: 250000000000,
      codTarget: d(540),
      site: { address: '전남 신안군 지도읍', region: '전남', landAreaM2: 200000, landType: '답' },
    },
    {
      name: '인천 2MW 루프탑',
      code: 'RT-2025-002',
      type: 'rooftop',
      capacityKw: 2000,
      status: 'gen-permit',
      client: '강원도청',
      epcValue: 25000000000,
      codTarget: d(300),
      site: { address: '인천 서구 가좌동', region: '인천', landAreaM2: 10000, landType: '대' },
    },
    {
      name: '서산 5MW 루프탑 태양광',
      code: 'SL-2025-004',
      type: 'solar',
      capacityKw: 5000,
      status: 'inspection',
      client: '대산석유화학',
      epcValue: 6000000000,
      codTarget: d(30),
      site: { address: '충남 서산시 대산읍', region: '충남', landAreaM2: 3000, landType: '대' },
    },
    {
      name: '나주 100MWh ESS',
      code: 'ES-2025-002',
      type: 'ess',
      capacityKw: 100000,
      status: 'gen-permit',
      client: '한국남부발전',
      epcValue: 55000000000,
      codTarget: d(400),
      site: { address: '전남 나주시 산포면', region: '전남', landAreaM2: 8000, landType: '대' },
    },
  ]

  const projects: any[] = []
  for (const p of projectData) {
    const created = await payload.create({
      collection: 'projects',
      data: {
        name: p.name,
        code: p.code,
        type: p.type,
        capacityKw: p.capacityKw,
        site: p.site,
        status: p.status,
        client: p.client,
        epcValue: p.epcValue,
        codTarget: p.codTarget,
      },
    })
    projects.push(created)
  }

  // 3. 마일스톤 상태·날짜 업데이트
  await updateMilestones(payload)

  console.warn(`[Seed] 완료 — 프로젝트 ${projects.length}개`)
}

export async function updateMilestones(payload: Payload) {
  const allProjects = await payload.find({
    collection: 'projects',
    limit: 100,
  })

  const statusProfiles: Record<string, { doneRatio: number; activeCount: number }> = {
    'gen-permit': { doneRatio: 0, activeCount: 1 },
    'dev-permit': { doneRatio: 0.2, activeCount: 2 },
    'civil': { doneRatio: 0.4, activeCount: 2 },
    'structural-elec': { doneRatio: 0.6, activeCount: 2 },
    'inspection': { doneRatio: 0.85, activeCount: 1 },
    'pre-cod': { doneRatio: 1, activeCount: 0 },
  }

  type MsStatus = 'pending' | 'active' | 'done' | 'blocked' | 'skipped'

  for (const proj of allProjects.docs) {
    const milestones = await payload.find({
      collection: 'project-milestones',
      where: { project: { equals: proj.id } },
      sort: 'seqOrder',
      limit: 100,
    })

    const profile = statusProfiles[proj.status as string] || statusProfiles['gen-permit']
    const total = milestones.docs.length
    const doneCount = Math.floor(total * profile.doneRatio)
    const activeCount = profile.activeCount

    for (let i = 0; i < milestones.docs.length; i++) {
      const ms = milestones.docs[i]
      let status: MsStatus = 'pending' // eslint-disable-line no-useless-assignment
      let plannedDate: string | undefined
      let actualDate: string | undefined
      let dueDate: string | undefined

      if (i < doneCount) {
        status = 'done'
        const daysAgo = (doneCount - i) * 15 + 10
        plannedDate = d(-daysAgo - 5)
        actualDate = d(-daysAgo)
        dueDate = d(-daysAgo + 3)
      } else if (i < doneCount + activeCount) {
        status = 'active'
        const offset = i === doneCount ? -3 : 10
        plannedDate = d(-7)
        dueDate = d(offset)
      } else {
        status = 'pending'
        const daysAhead = (i - doneCount - activeCount + 1) * 20
        plannedDate = d(daysAhead)
        dueDate = d(daysAhead + 14)
      }

      await payload.update({
        collection: 'project-milestones',
        id: ms.id,
        data: { status, plannedDate, actualDate, dueDate },
      })
    }
  }

  console.warn('[Seed] 마일스톤 상태·날짜 업데이트 완료')
}
