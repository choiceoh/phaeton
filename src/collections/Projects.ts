import type { CollectionConfig } from 'payload'

import { copyMilestones } from '../hooks/copyMilestones'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: { useAsTitle: 'name' },
  labels: { singular: '프로젝트', plural: '프로젝트 목록' },
  hooks: {
    afterChange: [copyMilestones],
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: '프로젝트명' },
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      label: '프로젝트 코드',
      admin: { description: 'SL-2025-001, WD-2025-001, ES-2025-001, HB-2025-001' },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      label: '사업 유형',
      options: [
        { label: '태양광', value: 'solar' },
        { label: '풍력', value: 'wind' },
        { label: 'ESS', value: 'ess' },
        { label: '하이브리드', value: 'hybrid' },
      ],
    },
    { name: 'capacityKw', type: 'number', label: '설비용량 (kW)' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'planning',
      label: '상태',
      options: [
        { label: '기획', value: 'planning' },
        { label: '인허가', value: 'permit' },
        { label: '시공', value: 'construction' },
        { label: '시운전', value: 'testing' },
        { label: '운영(COD)', value: 'cod' },
        { label: '해체', value: 'decommission' },
      ],
    },
    { name: 'site', type: 'relationship', relationTo: 'sites', label: '현장' },
    { name: 'codTarget', type: 'date', label: 'COD 목표일' },
    { name: 'codActual', type: 'date', label: 'COD 실제일' },
    { name: 'client', type: 'text', label: '발주처 / 사업주' },
    { name: 'epcValue', type: 'number', label: '도급금액 (원)' },
    { name: 'assignedPM', type: 'relationship', relationTo: 'users', label: '담당 PM' },
    {
      name: 'metadata',
      type: 'json',
      label: '추가 정보 (유형별 가변)',
      admin: { description: '모듈 수량, 인버터 스펙, 배터리 용량 등' },
    },
  ],
  access: {
    read: () => true,
    create: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
    update: ({ req }) => {
      const role = req.user?.role as string
      if (role === 'director') return true
      if (role === 'pm') return { assignedPM: { equals: req.user?.id } }
      return false
    },
    delete: ({ req }) => req.user?.role === 'director',
  },
}
