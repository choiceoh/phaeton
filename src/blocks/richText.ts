import type { Block } from 'payload'

export const RichTextBlock: Block = {
  slug: 'rich-text',
  labels: { singular: '본문', plural: '본문' },
  fields: [
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: '내용',
    },
  ],
}
