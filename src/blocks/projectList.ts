import type { Block } from 'payload'

export const ProjectListBlock: Block = {
  slug: 'project-list',
  labels: { singular: '프로젝트 목록', plural: '프로젝트 목록' },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: '제목',
      defaultValue: '프로젝트',
    },
    {
      name: 'viewType',
      type: 'select',
      label: '표시 형식',
      defaultValue: 'table',
      options: [
        { label: '테이블', value: 'table' },
        { label: '카드 그리드', value: 'grid' },
      ],
    },
    {
      name: 'statusFilter',
      type: 'select',
      label: '상태 필터',
      hasMany: true,
      options: [
        { label: '기획', value: 'planning' },
        { label: '인허가', value: 'permit' },
        { label: '시공', value: 'construction' },
        { label: '시운전', value: 'testing' },
        { label: '운영', value: 'cod' },
      ],
    },
    {
      name: 'typeFilter',
      type: 'select',
      label: '유형 필터',
      hasMany: true,
      options: [
        { label: '태양광', value: 'solar' },
        { label: '풍력', value: 'wind' },
        { label: 'ESS', value: 'ess' },
        { label: '하이브리드', value: 'hybrid' },
      ],
    },
    {
      name: 'limit',
      type: 'number',
      label: '최대 표시 수',
      defaultValue: 20,
    },
  ],
}
