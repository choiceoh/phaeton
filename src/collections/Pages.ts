import type { CollectionConfig } from 'payload'

import {
  AlertListBlock,
  ChartBlock,
  HeadingBlock,
  ProjectListBlock,
  RichTextBlock,
  StaffOverviewBlock,
  StatsRowBlock,
} from '@/blocks'

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: '페이지', plural: '페이지' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'updatedAt'],
    group: '콘텐츠',
    livePreview: {
      url: ({ data }) => {
        const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        return `${base}/p/${data.slug}`
      },
    },
  },
  access: {
    read: () => true,
    create: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
    update: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
    delete: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: '페이지 제목',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      label: 'URL 슬러그',
      admin: { position: 'sidebar', description: '/p/슬러그 형태로 접근' },
    },
    {
      name: 'status',
      type: 'select',
      label: '상태',
      defaultValue: 'draft',
      options: [
        { label: '초안', value: 'draft' },
        { label: '게시됨', value: 'published' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'showInNav',
      type: 'checkbox',
      label: '내비게이션에 표시',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'navOrder',
      type: 'number',
      label: '메뉴 순서',
      defaultValue: 99,
      admin: {
        position: 'sidebar',
        condition: (data) => data.showInNav,
      },
    },
    {
      name: 'layout',
      type: 'blocks',
      label: '페이지 레이아웃',
      blocks: [
        HeadingBlock,
        RichTextBlock,
        StatsRowBlock,
        ProjectListBlock,
        AlertListBlock,
        StaffOverviewBlock,
        ChartBlock,
      ],
    },
  ],
}
