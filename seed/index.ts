import type { Payload } from 'payload'

import { seedMilestoneTemplates } from './milestones'

// 날짜 헬퍼: 오늘 기준 ±days
function d(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

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

  // 2. 현장
  const siteData = [
    {
      name: '영암 태양광단지',
      address: '전남 영암군 삼호읍',
      region: '전남',
      landAreaM2: 150000,
      landType: '답',
    },
    {
      name: '해남 풍력단지',
      address: '전남 해남군 송지면',
      region: '전남',
      landAreaM2: 300000,
      landType: '임야',
    },
    {
      name: '당진 ESS',
      address: '충남 당진시 석문면',
      region: '충남',
      landAreaM2: 5000,
      landType: '대',
    },
    {
      name: '김제 태양광',
      address: '전북 김제시 광활면',
      region: '전북',
      landAreaM2: 80000,
      landType: '전',
    },
    {
      name: '신안 태양광',
      address: '전남 신안군 지도읍',
      region: '전남',
      landAreaM2: 200000,
      landType: '답',
    },
    {
      name: '태백 풍력',
      address: '강원 태백시 혈동',
      region: '강원',
      landAreaM2: 500000,
      landType: '임야',
    },
    {
      name: '서산 루프탑',
      address: '충남 서산시 대산읍',
      region: '충남',
      landAreaM2: 3000,
      landType: '대',
    },
    {
      name: '나주 ESS',
      address: '전남 나주시 산포면',
      region: '전남',
      landAreaM2: 8000,
      landType: '대',
    },
  ]

  const sites: any[] = []
  for (const s of siteData) {
    const created = await payload.create({ collection: 'sites', data: s })
    sites.push(created)
  }

  // 3. 프로젝트 (afterChange hook이 마일스톤 자동 생성)
  const projectData = [
    {
      name: '영암 100MW 태양광',
      code: 'SL-2024-001',
      type: 'solar' as const,
      capacityKw: 100000,
      siteIdx: 0,
      status: 'construction' as const,
      client: '한국남부발전',
      epcValue: 120000000000,
      codTarget: d(90),
    },
    {
      name: '해남 20MW 풍력',
      code: 'WD-2025-001',
      type: 'wind' as const,
      capacityKw: 20000,
      siteIdx: 1,
      status: 'permit' as const,
      client: '한국서부발전',
      epcValue: 45000000000,
      codTarget: d(365),
    },
    {
      name: '당진 50MWh ESS',
      code: 'ES-2025-001',
      type: 'ess' as const,
      capacityKw: 50000,
      siteIdx: 2,
      status: 'construction' as const,
      client: '한국중부발전',
      epcValue: 30000000000,
      codTarget: d(60),
    },
    {
      name: '김제 30MW 태양광',
      code: 'SL-2025-002',
      type: 'solar' as const,
      capacityKw: 30000,
      siteIdx: 3,
      status: 'permit' as const,
      client: '김제시',
      epcValue: 35000000000,
      codTarget: d(200),
    },
    {
      name: '신안 200MW 태양광',
      code: 'SL-2025-003',
      type: 'solar' as const,
      capacityKw: 200000,
      siteIdx: 4,
      status: 'planning' as const,
      client: '한국전력',
      epcValue: 250000000000,
      codTarget: d(540),
    },
    {
      name: '태백 10MW 풍력',
      code: 'WD-2025-002',
      type: 'wind' as const,
      capacityKw: 10000,
      siteIdx: 5,
      status: 'permit' as const,
      client: '강원도청',
      epcValue: 25000000000,
      codTarget: d(300),
    },
    {
      name: '서산 5MW 루프탑 태양광',
      code: 'SL-2025-004',
      type: 'solar' as const,
      capacityKw: 5000,
      siteIdx: 6,
      status: 'construction' as const,
      client: '대산석유화학',
      epcValue: 6000000000,
      codTarget: d(30),
    },
    {
      name: '나주 100MWh ESS',
      code: 'ES-2025-002',
      type: 'ess' as const,
      capacityKw: 100000,
      siteIdx: 7,
      status: 'planning' as const,
      client: '한국남부발전',
      epcValue: 55000000000,
      codTarget: d(400),
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
        site: sites[p.siteIdx].id,
        status: p.status,
        client: p.client,
        epcValue: p.epcValue,
        codTarget: p.codTarget,
      },
    })
    projects.push(created)
  }

  // 4. 마일스톤 상태·날짜 업데이트
  await updateMilestones(payload)

  console.warn(`[Seed] 완료 — 현장 ${sites.length}개, 프로젝트 ${projects.length}개`)
}

export async function updateMilestones(payload: Payload) {
  const allProjects = await payload.find({
    collection: 'projects',
    limit: 100,
  })

  const statusProfiles: Record<string, { doneRatio: number; activeCount: number }> = {
    planning: { doneRatio: 0, activeCount: 1 },
    permit: { doneRatio: 0.2, activeCount: 2 },
    construction: { doneRatio: 0.6, activeCount: 2 },
    testing: { doneRatio: 0.85, activeCount: 1 },
    cod: { doneRatio: 1, activeCount: 0 },
  }

  type MsStatus = 'pending' | 'active' | 'done' | 'blocked' | 'skipped'

  for (const proj of allProjects.docs) {
    const milestones = await payload.find({
      collection: 'project-milestones',
      where: { project: { equals: proj.id } },
      sort: 'seqOrder',
      limit: 100,
    })

    const profile = statusProfiles[proj.status] || statusProfiles.planning
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
