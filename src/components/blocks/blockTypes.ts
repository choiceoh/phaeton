export interface FieldOption {
  label: string
  value: string
}

export interface FieldDef {
  name: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'checkbox'
  label: string
  required?: boolean
  options?: FieldOption[]
}

export interface BlockTypeDef {
  slug: string
  label: string
  description: string
  defaults: Record<string, any>
  fields: FieldDef[]
  editNote?: string
}

export const BLOCK_TYPES: BlockTypeDef[] = [
  {
    slug: 'heading',
    label: '제목',
    description: '섹션 제목 + 설명',
    defaults: { text: '새 제목', level: 'h2', description: '' },
    fields: [
      { name: 'text', type: 'text', label: '제목 텍스트', required: true },
      {
        name: 'level',
        type: 'select',
        label: '크기',
        options: [
          { label: 'H1 (큰 제목)', value: 'h1' },
          { label: 'H2 (중간 제목)', value: 'h2' },
          { label: 'H3 (작은 제목)', value: 'h3' },
        ],
      },
      { name: 'description', type: 'textarea', label: '설명' },
    ],
  },
  {
    slug: 'rich-text',
    label: '본문',
    description: '리치텍스트 본문 콘텐츠',
    defaults: { content: null },
    fields: [],
    editNote: '리치텍스트 편집은 저장 후 Admin Panel에서 가능합니다',
  },
  {
    slug: 'stats-row',
    label: '통계 카드',
    description: '프로젝트 단계별 현황 요약',
    defaults: { title: '' },
    fields: [{ name: 'title', type: 'text', label: '섹션 제목' }],
  },
  {
    slug: 'project-list',
    label: '프로젝트 목록',
    description: '필터 가능한 프로젝트 테이블/그리드',
    defaults: { title: '프로젝트', viewType: 'table', statusFilter: [], typeFilter: [], limit: 20 },
    fields: [
      { name: 'title', type: 'text', label: '제목' },
      {
        name: 'viewType',
        type: 'select',
        label: '표시 형식',
        options: [
          { label: '테이블', value: 'table' },
          { label: '카드 그리드', value: 'grid' },
        ],
      },
      {
        name: 'statusFilter',
        type: 'multiselect',
        label: '상태 필터',
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
        type: 'multiselect',
        label: '유형 필터',
        options: [
          { label: '태양광', value: 'solar' },
          { label: '풍력', value: 'wind' },
          { label: 'ESS', value: 'ess' },
          { label: '하이브리드', value: 'hybrid' },
        ],
      },
      { name: 'limit', type: 'number', label: '최대 표시 수' },
    ],
  },
  {
    slug: 'alert-list',
    label: '알림 목록',
    description: '지연/만료/과할당 알림',
    defaults: { title: '알림', alertTypes: ['overdue', 'expiring', 'overloaded'], limit: 5 },
    fields: [
      { name: 'title', type: 'text', label: '제목' },
      {
        name: 'alertTypes',
        type: 'multiselect',
        label: '알림 유형',
        options: [
          { label: '지연 마일스톤', value: 'overdue' },
          { label: '만료 임박 서류', value: 'expiring' },
          { label: '과할당 인력', value: 'overloaded' },
        ],
      },
      { name: 'limit', type: 'number', label: '유형별 최대 표시 수' },
    ],
  },
  {
    slug: 'staff-overview',
    label: '인력 현황',
    description: '인력 할당률 테이블',
    defaults: { title: '인력 현황', showOnlyOverloaded: false },
    fields: [
      { name: 'title', type: 'text', label: '제목' },
      { name: 'showOnlyOverloaded', type: 'checkbox', label: '과할당만 표시' },
    ],
  },
  {
    slug: 'chart',
    label: '차트',
    description: '막대/도넛 차트',
    defaults: { title: '', chartType: 'bar', dataSource: 'project-by-status' },
    fields: [
      { name: 'title', type: 'text', label: '제목' },
      {
        name: 'chartType',
        type: 'select',
        label: '차트 유형',
        options: [
          { label: '막대 차트', value: 'bar' },
          { label: '도넛 차트', value: 'donut' },
        ],
      },
      {
        name: 'dataSource',
        type: 'select',
        label: '데이터',
        options: [
          { label: '프로젝트 상태별', value: 'project-by-status' },
          { label: '프로젝트 유형별', value: 'project-by-type' },
          { label: '인력 할당률 분포', value: 'staff-allocation' },
        ],
      },
    ],
  },
]

export function getBlockTypeDef(slug: string): BlockTypeDef | undefined {
  return BLOCK_TYPES.find((b) => b.slug === slug)
}
