import type { CollectionConfig } from 'payload'

import { checkMilestoneDeps } from '../hooks/checkMilestoneDeps'

export const ProjectMilestones: CollectionConfig = {
  slug: 'project-milestones',
  admin: { useAsTitle: 'name' },
  labels: { singular: '프로젝트 마일스톤', plural: '프로젝트 마일스톤 목록' },
  hooks: {
    beforeChange: [checkMilestoneDeps],
  },
  fields: [
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      label: '프로젝트',
    },
    {
      name: 'template',
      type: 'relationship',
      relationTo: 'milestone-templates',
      label: '원본 템플릿',
    },
    { name: 'name', type: 'text', required: true, label: '마일스톤명' },
    { name: 'seqOrder', type: 'number', required: true, label: '순서' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      label: '상태',
      options: [
        { label: '대기', value: 'pending' },
        { label: '진행중', value: 'active' },
        { label: '완료', value: 'done' },
        { label: '차단', value: 'blocked' },
        { label: '건너뜀', value: 'skipped' },
      ],
    },
    { name: 'plannedDate', type: 'date', label: '계획일' },
    { name: 'actualDate', type: 'date', label: '실제일' },
    { name: 'dueDate', type: 'date', label: '마감일' },
    { name: 'assignee', type: 'relationship', relationTo: 'staff', label: '담당자' },
    { name: 'note', type: 'textarea', label: '비고' },
  ],
  access: {
    read: () => true,
    create: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
    update: ({ req }) => ['director', 'pm', 'engineer'].includes(req.user?.role as string),
    delete: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
  },
}
