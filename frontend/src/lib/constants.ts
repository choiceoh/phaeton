import type { FieldType } from './types'

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: '텍스트',
  textarea: '장문 텍스트',
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
}

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
