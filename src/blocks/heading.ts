import type { Block } from 'payload'

export const HeadingBlock: Block = {
  slug: 'heading',
  labels: { singular: '제목', plural: '제목' },
  fields: [
    {
      name: 'text',
      type: 'text',
      required: true,
      label: '제목 텍스트',
    },
    {
      name: 'level',
      type: 'select',
      label: '크기',
      defaultValue: 'h2',
      options: [
        { label: 'H1 (큰 제목)', value: 'h1' },
        { label: 'H2 (중간 제목)', value: 'h2' },
        { label: 'H3 (작은 제목)', value: 'h3' },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      label: '설명 (선택)',
    },
  ],
}
