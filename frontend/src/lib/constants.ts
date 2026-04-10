import type { FieldType } from './types'

// -- 용어 한국어화 (테이블→업무, 필드→항목, 레코드→데이터) --
export const TERM = {
  collection: '업무',
  collections: '업무 목록',
  field: '항목',
  fields: '항목',
  record: '데이터',
  records: '데이터',
  newCollection: '새 업무 만들기',
  newRecord: '새 데이터',
  noCollections: '아직 업무가 없습니다',
  noCollectionsDesc: '새 업무를 만들어 데이터 관리를 시작하세요.',
  noRecords: '아직 데이터가 없습니다',
  noRecordsDesc: '"새 데이터" 버튼을 눌러 첫 데이터를 입력하세요.',
} as const

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: '텍스트',
  textarea: '멀티 텍스트',
  number: '숫자',
  integer: '정수',
  boolean: '불리언',
  date: '날짜',
  datetime: '일시',
  time: '시간',
  select: '선택',
  multiselect: '다중 선택',
  relation: '관계',
  user: '사용자',
  file: '파일',
  json: 'JSON',
  autonumber: '자동 번호',
  formula: '수식',
  lookup: '조회',
  rollup: '집계',
  label: '라벨',
  line: '라인',
  spacer: '공백',
}

export const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  text: 'Aa',
  textarea: '¶',
  number: '#',
  integer: '1',
  boolean: '☐',
  date: '📅',
  datetime: '🕐',
  time: '⏱',
  select: '▼',
  multiselect: '▽',
  relation: '🔗',
  user: '👤',
  file: '📎',
  json: '{ }',
  autonumber: '⧣',
  formula: 'fx',
  lookup: '->',
  rollup: 'E',
  label: 'Lbl',
  line: '━',
  spacer: '⬜',
}

export const LAYOUT_FIELD_TYPES: FieldType[] = ['label', 'line', 'spacer']
export const isLayoutType = (ft: FieldType) => LAYOUT_FIELD_TYPES.includes(ft)

export const COMPUTED_FIELD_TYPES: FieldType[] = ['formula', 'lookup', 'rollup']
export const isComputedType = (ft: FieldType) => COMPUTED_FIELD_TYPES.includes(ft)

export const ROLLUP_FUNCTIONS = [
  { value: 'SUM', label: '합계 (SUM)' },
  { value: 'COUNT', label: '개수 (COUNT)' },
  { value: 'AVG', label: '평균 (AVG)' },
  { value: 'MIN', label: '최소 (MIN)' },
  { value: 'MAX', label: '최대 (MAX)' },
  { value: 'COUNTA', label: '비어있지 않은 개수 (COUNTA)' },
]

export const ROLE_LABELS: Record<string, string> = {
  director: '디렉터',
  pm: 'PM',
  engineer: '엔지니어',
  viewer: '열람자',
}

export const ON_DELETE_OPTIONS = [
  { value: 'SET NULL', label: '참조 제거 (NULL)' },
  { value: 'CASCADE', label: '함께 삭제' },
  { value: 'RESTRICT', label: '삭제 차단' },
  { value: 'NO ACTION', label: '동작 없음' },
]

export const RELATION_TYPE_LABELS = {
  one_to_one: '1:1',
  one_to_many: '1:N',
  many_to_many: 'N:M',
}

export const WIDTH_OPTIONS = [
  { value: 1, label: '1/6' },
  { value: 2, label: '1/3' },
  { value: 3, label: '1/2' },
  { value: 6, label: '전체' },
]

export const HEIGHT_OPTIONS = [
  { value: 1, label: '1줄' },
  { value: 2, label: '2줄' },
  { value: 3, label: '3줄' },
]

export const NUMBER_DISPLAY_TYPES = [
  { value: 'plain', label: '기본 숫자' },
  { value: 'currency', label: '통화 (₩)' },
  { value: 'percent', label: '퍼센트 (%)' },
  { value: 'progress', label: '진행률 바' },
]

export const TEXT_DISPLAY_TYPES = [
  { value: 'plain', label: '기본 텍스트' },
  { value: 'url', label: 'URL (링크)' },
  { value: 'email', label: '이메일' },
  { value: 'phone', label: '전화번호' },
]

export const VALIDATION_OPTIONS = [
  { value: 'none', label: '모든 값 허용' },
  { value: 'email', label: '이메일' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: '전화번호' },
  { value: 'number_only', label: '숫자만' },
  { value: 'alpha_only', label: '영문만' },
  { value: 'alphanumeric', label: '영문+숫자' },
  { value: 'regex', label: '정규식' },
]

// -- 필터 연산자 --
export const FILTER_OPERATORS = [
  { value: 'eq', label: '같음' },
  { value: 'neq', label: '같지 않음' },
  { value: 'gt', label: '초과' },
  { value: 'gte', label: '이상' },
  { value: 'lt', label: '미만' },
  { value: 'lte', label: '이하' },
  { value: 'like', label: '포함' },
  { value: 'in', label: '포함 (목록)' },
  { value: 'is_null', label: '비어있음' },
] as const

export type FilterOperator = (typeof FILTER_OPERATORS)[number]['value']

// Which operators make sense per field type.
export function operatorsForFieldType(ft: FieldType): FilterOperator[] {
  switch (ft) {
    case 'number':
    case 'integer':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null']
    case 'date':
    case 'datetime':
    case 'time':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_null']
    case 'boolean':
      return ['eq', 'neq', 'is_null']
    case 'select':
      return ['eq', 'neq', 'in', 'is_null']
    case 'multiselect':
      return ['like', 'is_null']
    case 'text':
    case 'textarea':
      return ['eq', 'neq', 'like', 'is_null']
    default:
      return ['eq', 'neq', 'like', 'is_null']
  }
}

// -- 페이지 사이즈 옵션 --
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
