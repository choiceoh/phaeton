import type { Payload } from 'payload'

interface MilestoneTemplate {
  name: string
  category: 'admin' | 'engineering' | 'procurement' | 'construction'
  seqOrder: number
  typicalDays: number
  isCritical: boolean
}

// 태양광 15단계
const solarTemplates: MilestoneTemplate[] = [
  { name: '사업타당성검토', category: 'admin', seqOrder: 1, typicalDays: 30, isCritical: false },
  { name: '발전사업허가', category: 'admin', seqOrder: 2, typicalDays: 90, isCritical: true },
  { name: '개발행위허가', category: 'admin', seqOrder: 3, typicalDays: 120, isCritical: true },
  { name: '농지전용허가', category: 'admin', seqOrder: 4, typicalDays: 60, isCritical: false },
  { name: '전기사업허가', category: 'admin', seqOrder: 5, typicalDays: 60, isCritical: true },
  { name: '환경영향평가', category: 'admin', seqOrder: 6, typicalDays: 180, isCritical: true },
  { name: '설계 완료', category: 'engineering', seqOrder: 7, typicalDays: 45, isCritical: false },
  { name: '자재 발주', category: 'procurement', seqOrder: 8, typicalDays: 14, isCritical: false },
  { name: '착공신고', category: 'construction', seqOrder: 9, typicalDays: 7, isCritical: true },
  {
    name: '구조물 시공',
    category: 'construction',
    seqOrder: 10,
    typicalDays: 60,
    isCritical: false,
  },
  { name: '모듈 설치', category: 'construction', seqOrder: 11, typicalDays: 30, isCritical: false },
  { name: '전기 공사', category: 'construction', seqOrder: 12, typicalDays: 30, isCritical: false },
  { name: '사용전검사', category: 'admin', seqOrder: 13, typicalDays: 30, isCritical: true },
  { name: '준공검사', category: 'admin', seqOrder: 14, typicalDays: 14, isCritical: true },
  { name: '상업운전개시(COD)', category: 'admin', seqOrder: 15, typicalDays: 0, isCritical: true },
]

// 풍력 17단계
const windTemplates: MilestoneTemplate[] = [
  { name: '사업타당성검토', category: 'admin', seqOrder: 1, typicalDays: 45, isCritical: false },
  {
    name: '풍황계측 (1년+)',
    category: 'engineering',
    seqOrder: 2,
    typicalDays: 365,
    isCritical: true,
  },
  { name: '발전사업허가', category: 'admin', seqOrder: 3, typicalDays: 90, isCritical: true },
  { name: '환경영향평가', category: 'admin', seqOrder: 4, typicalDays: 365, isCritical: true },
  { name: '개발행위허가', category: 'admin', seqOrder: 5, typicalDays: 120, isCritical: true },
  { name: '산지전용허가', category: 'admin', seqOrder: 6, typicalDays: 90, isCritical: false },
  { name: '전기사업허가', category: 'admin', seqOrder: 7, typicalDays: 60, isCritical: true },
  { name: '항공장애 심의', category: 'admin', seqOrder: 8, typicalDays: 60, isCritical: true },
  {
    name: '기본설계 완료',
    category: 'engineering',
    seqOrder: 9,
    typicalDays: 60,
    isCritical: false,
  },
  {
    name: '실시설계 완료',
    category: 'engineering',
    seqOrder: 10,
    typicalDays: 45,
    isCritical: false,
  },
  { name: '터빈 발주', category: 'procurement', seqOrder: 11, typicalDays: 14, isCritical: true },
  { name: '착공신고', category: 'construction', seqOrder: 12, typicalDays: 7, isCritical: true },
  {
    name: '기초·도로 공사',
    category: 'construction',
    seqOrder: 13,
    typicalDays: 120,
    isCritical: false,
  },
  { name: '터빈 설치', category: 'construction', seqOrder: 14, typicalDays: 90, isCritical: true },
  {
    name: '전기·계통 공사',
    category: 'construction',
    seqOrder: 15,
    typicalDays: 60,
    isCritical: false,
  },
  { name: '사용전검사', category: 'admin', seqOrder: 16, typicalDays: 30, isCritical: true },
  { name: '상업운전개시(COD)', category: 'admin', seqOrder: 17, typicalDays: 0, isCritical: true },
]

// ESS 12단계
const essTemplates: MilestoneTemplate[] = [
  { name: '사업타당성검토', category: 'admin', seqOrder: 1, typicalDays: 30, isCritical: false },
  { name: '전기사업허가', category: 'admin', seqOrder: 2, typicalDays: 60, isCritical: true },
  { name: '소방시설 심의', category: 'admin', seqOrder: 3, typicalDays: 45, isCritical: true },
  { name: '설계 완료', category: 'engineering', seqOrder: 4, typicalDays: 30, isCritical: false },
  {
    name: '배터리·PCS 발주',
    category: 'procurement',
    seqOrder: 5,
    typicalDays: 14,
    isCritical: true,
  },
  { name: '착공신고', category: 'construction', seqOrder: 6, typicalDays: 7, isCritical: true },
  {
    name: '토목·건축 공사',
    category: 'construction',
    seqOrder: 7,
    typicalDays: 60,
    isCritical: false,
  },
  {
    name: '배터리·PCS 설치',
    category: 'construction',
    seqOrder: 8,
    typicalDays: 30,
    isCritical: false,
  },
  {
    name: '전기·소방 공사',
    category: 'construction',
    seqOrder: 9,
    typicalDays: 30,
    isCritical: false,
  },
  { name: '사용전검사', category: 'admin', seqOrder: 10, typicalDays: 30, isCritical: true },
  { name: '전력거래소 등록', category: 'admin', seqOrder: 11, typicalDays: 30, isCritical: true },
  { name: '상업운전개시(COD)', category: 'admin', seqOrder: 12, typicalDays: 0, isCritical: true },
]

export async function seedMilestoneTemplates(payload: Payload) {
  type ProjectType = 'solar' | 'wind' | 'ess'
  const allTemplates: { projectType: ProjectType; templates: MilestoneTemplate[] }[] = [
    { projectType: 'solar', templates: solarTemplates },
    { projectType: 'wind', templates: windTemplates },
    { projectType: 'ess', templates: essTemplates },
  ]

  let total = 0

  for (const { projectType, templates } of allTemplates) {
    for (const tmpl of templates) {
      await payload.create({
        collection: 'milestone-templates',
        data: {
          projectType,
          ...tmpl,
        },
      })
      total++
    }
  }

  console.log(
    `[Phaeton] 마일스톤 템플릿 시드 완료: solar ${solarTemplates.length} + ` +
      `wind ${windTemplates.length} + ess ${essTemplates.length} = ${total}건`,
  )
}
