import type { FieldType } from './types'

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
  file: '파일',
  json: 'JSON',
  user: '사용자',
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
  file: '📎',
  json: '{ }',
  user: '👤',
  label: 'Lbl',
  line: '━',
  spacer: '⬜',
}

export const LAYOUT_FIELD_TYPES: FieldType[] = ['label', 'line', 'spacer']
export const isLayoutType = (ft: FieldType) => LAYOUT_FIELD_TYPES.includes(ft)

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
