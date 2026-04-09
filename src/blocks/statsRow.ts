import type { Block } from 'payload'

export const StatsRowBlock: Block = {
  slug: 'stats-row',
  labels: { singular: '통계 카드', plural: '통계 카드' },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: '섹션 제목',
    },
  ],
}
