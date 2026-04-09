import type { Block } from 'payload'

export const AlertListBlock: Block = {
  slug: 'alert-list',
  labels: { singular: '알림 목록', plural: '알림 목록' },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: '제목',
      defaultValue: '알림',
    },
    {
      name: 'alertTypes',
      type: 'select',
      label: '알림 유형',
      hasMany: true,
      defaultValue: ['overdue', 'expiring', 'overloaded'],
      options: [
        { label: '지연 마일스톤', value: 'overdue' },
        { label: '만료 임박 서류', value: 'expiring' },
        { label: '과할당 인력', value: 'overloaded' },
      ],
    },
    {
      name: 'limit',
      type: 'number',
      label: '유형별 최대 표시 수',
      defaultValue: 5,
    },
  ],
}
