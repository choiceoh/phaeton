import type { CollectionConfig } from 'payload'

import { copyMilestones } from '../hooks/copyMilestones.ts'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: { useAsTitle: 'name' },
  labels: { singular: '프로젝트', plural: '프로젝트 목록' },
  versions: { drafts: false, maxPerDoc: 20 },
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
    {
      name: 'department',
      type: 'select',
      label: '담당부서',
      options: [
        { label: '신재생사업본부', value: 'renewable' },
        { label: '전략사업본부', value: 'strategy' },
        { label: 'O&M사업본부', value: 'onm' },
        { label: '미래사업실', value: 'future' },
        { label: '기획조정실', value: 'planning' },
        { label: '솔라사업실', value: 'solar' },
        { label: '개발사업본부', value: 'development' },
      ],
    },
    { name: 'capacityKw', type: 'number', label: '설비용량 (kW)' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'gen-permit',
      label: '상태',
      options: [
        { label: '발전허가', value: 'gen-permit' },
        { label: '개발허가', value: 'dev-permit' },
        { label: '토목', value: 'civil' },
        { label: '구조물 및 전기공사', value: 'structural-elec' },
        { label: '사용전 검사', value: 'inspection' },
        { label: '준공대기', value: 'pre-cod' },
      ],
    },
    {
      name: 'site',
      type: 'group',
      label: '현장 정보',
      fields: [
        { name: 'address', type: 'text', label: '주소' },
        { name: 'region', type: 'text', label: '지역 (시도)' },
        {
          name: 'coordinates',
          type: 'group',
          label: '좌표',
          fields: [
            { name: 'lat', type: 'number', label: '위도' },
            { name: 'lng', type: 'number', label: '경도' },
          ],
        },
        { name: 'landAreaM2', type: 'number', label: '부지면적 (m²)' },
        { name: 'landType', type: 'text', label: '지목 (임야, 답, 전 등)' },
      ],
    },
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
      if (role === 'pm') {
        const dept = req.user?.department as string | undefined
        const conditions = [{ assignedPM: { equals: req.user?.id } }]
        if (dept) conditions.push({ department: { equals: dept } } as any)
        return { or: conditions }
      }
      return false
    },
    delete: ({ req }) => req.user?.role === 'director',
  },
}
