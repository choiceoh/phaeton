import type { LayoutItem, ResponsiveLayouts } from 'react-grid-layout'

export interface WidgetDef {
  id: string
  label: string
  description: string
  category: 'overview' | 'project' | 'alert' | 'staff'
  defaultW: number
  defaultH: number
  minW: number
  minH: number
  maxW?: number
  maxH?: number
  dataKeys: string[]
}

export const WIDGET_REGISTRY: Record<string, WidgetDef> = {
  'status-cards': {
    id: 'status-cards',
    label: '상태 카드',
    description: '프로젝트 단계별 현황 요약',
    category: 'overview',
    defaultW: 12,
    defaultH: 2,
    minW: 6,
    minH: 2,
    maxH: 2,
    dataKeys: ['summary'],
  },
  'project-grid': {
    id: 'project-grid',
    label: '프로젝트 목록',
    description: '필터링 가능한 프로젝트 카드 그리드',
    category: 'project',
    defaultW: 8,
    defaultH: 6,
    minW: 4,
    minH: 3,
    dataKeys: ['projects'],
  },
  'alert-overdue': {
    id: 'alert-overdue',
    label: '지연 마일스톤',
    description: '기한 초과된 마일스톤 목록',
    category: 'alert',
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 2,
    dataKeys: ['overdue'],
  },
  'alert-expiring': {
    id: 'alert-expiring',
    label: '만료 임박 서류',
    description: '90일 이내 만료 예정 서류',
    category: 'alert',
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 2,
    dataKeys: ['expiring'],
  },
  'alert-overloaded': {
    id: 'alert-overloaded',
    label: '과할당 인력',
    description: '할당률 100% 초과 인력',
    category: 'alert',
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 2,
    dataKeys: ['overloadedStaff'],
  },
  'staff-table': {
    id: 'staff-table',
    label: '인력 현황 테이블',
    description: '전체 인력 할당률 목록',
    category: 'staff',
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 3,
    dataKeys: ['staffLoad'],
  },
}

export const CATEGORY_LABELS: Record<string, string> = {
  overview: '개요',
  project: '프로젝트',
  alert: '알림',
  staff: '인력',
}

export function getDefaultLayout(): { layouts: ResponsiveLayouts; widgets: string[] } {
  const widgets = [
    'status-cards',
    'project-grid',
    'alert-overdue',
    'alert-expiring',
    'alert-overloaded',
  ]
  const lg: LayoutItem[] = [
    { i: 'status-cards', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2, maxH: 2 },
    { i: 'project-grid', x: 0, y: 2, w: 8, h: 6, minW: 4, minH: 3 },
    { i: 'alert-overdue', x: 8, y: 2, w: 4, h: 3, minW: 3, minH: 2 },
    { i: 'alert-expiring', x: 8, y: 5, w: 4, h: 3, minW: 3, minH: 2 },
    { i: 'alert-overloaded', x: 8, y: 8, w: 4, h: 3, minW: 3, minH: 2 },
  ]
  return { layouts: { lg }, widgets }
}
