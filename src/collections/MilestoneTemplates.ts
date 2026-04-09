import type { CollectionConfig } from 'payload'

export const MilestoneTemplates: CollectionConfig = {
  slug: 'milestone-templates',
  admin: { useAsTitle: 'name' },
  labels: { singular: '마일스톤 템플릿', plural: '마일스톤 템플릿 목록' },
  fields: [
    {
      name: 'projectType',
      type: 'select',
      required: true,
      label: '프로젝트 유형',
      options: [
        { label: '태양광', value: 'solar' },
        { label: '루프탑', value: 'rooftop' },
        { label: 'ESS', value: 'ess' },
      ],
    },
    { name: 'name', type: 'text', required: true, label: '마일스톤명' },
    {
      name: 'category',
      type: 'select',
      required: true,
      label: '카테고리',
      options: [
        { label: '행정·인허가', value: 'admin' },
        { label: '설계', value: 'engineering' },
        { label: '조달', value: 'procurement' },
        { label: '시공', value: 'construction' },
      ],
    },
    { name: 'seqOrder', type: 'number', required: true, label: '순서' },
    { name: 'typicalDays', type: 'number', label: '통상 소요일' },
    { name: 'isCritical', type: 'checkbox', defaultValue: false, label: '크리티컬 패스' },
    { name: 'description', type: 'textarea', label: '설명' },
  ],
  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === 'director',
    update: ({ req }) => req.user?.role === 'director',
    delete: ({ req }) => req.user?.role === 'director',
  },
}
