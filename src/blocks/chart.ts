import type { Block } from 'payload'

export const ChartBlock: Block = {
  slug: 'chart',
  labels: { singular: '차트', plural: '차트' },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: '제목',
    },
    {
      name: 'chartType',
      type: 'select',
      label: '차트 유형',
      defaultValue: 'bar',
      options: [
        { label: '막대 차트', value: 'bar' },
        { label: '도넛 차트', value: 'donut' },
      ],
    },
    {
      name: 'dataSource',
      type: 'select',
      label: '데이터',
      defaultValue: 'project-by-status',
      options: [
        { label: '프로젝트 상태별', value: 'project-by-status' },
        { label: '프로젝트 유형별', value: 'project-by-type' },
        { label: '인력 할당률 분포', value: 'staff-allocation' },
      ],
    },
  ],
}
