import type { Block } from 'payload'

export const StaffOverviewBlock: Block = {
  slug: 'staff-overview',
  labels: { singular: '인력 현황', plural: '인력 현황' },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: '제목',
      defaultValue: '인력 현황',
    },
    {
      name: 'showOnlyOverloaded',
      type: 'checkbox',
      label: '과할당만 표시',
      defaultValue: false,
    },
  ],
}
