'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type ColumnKey =
  | 'name'
  | 'code'
  | 'type'
  | 'status'
  | 'department'
  | 'capacity_kw'
  | 'progress'
  | 'milestones'
  | 'cod_target'
  | 'next_due'
  | 'client'
  | 'pm_name'
  | 'epc_value'
  | 'region'

export interface ColumnDef {
  key: ColumnKey
  label: string
  defaultVisible: boolean
  locked?: boolean
}

export const PROJECT_COLUMNS: ColumnDef[] = [
  { key: 'name', label: '프로젝트명', defaultVisible: true, locked: true },
  { key: 'code', label: '프로젝트 코드', defaultVisible: false },
  { key: 'type', label: '유형', defaultVisible: true },
  { key: 'status', label: '상태', defaultVisible: true },
  { key: 'department', label: '부서', defaultVisible: false },
  { key: 'capacity_kw', label: '용량(kW)', defaultVisible: true },
  { key: 'progress', label: '진행률', defaultVisible: true },
  { key: 'milestones', label: '마일스톤', defaultVisible: true },
  { key: 'cod_target', label: 'COD 목표', defaultVisible: true },
  { key: 'next_due', label: '다음 기한', defaultVisible: false },
  { key: 'client', label: '발주처', defaultVisible: false },
  { key: 'pm_name', label: '담당 PM', defaultVisible: false },
  { key: 'epc_value', label: 'EPC 금액', defaultVisible: false },
  { key: 'region', label: '지역', defaultVisible: false },
]

const STORAGE_KEY = 'phaeton-project-columns'

function getDefaultVisible(): ColumnKey[] {
  return PROJECT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
}

function readFromStorage(): ColumnKey[] {
  if (typeof window === 'undefined') return getDefaultVisible()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultVisible()
    const parsed = JSON.parse(raw) as ColumnKey[]
    if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultVisible()
    if (!parsed.includes('name')) parsed.unshift('name')
    return parsed
  } catch {
    return getDefaultVisible()
  }
}

function writeToStorage(keys: ColumnKey[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  window.dispatchEvent(new Event('column-prefs-change'))
}

function subscribe(cb: () => void) {
  window.addEventListener('column-prefs-change', cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener('column-prefs-change', cb)
    window.removeEventListener('storage', cb)
  }
}

export function useColumnPrefs() {
  const visibleKeys = useSyncExternalStore(subscribe, readFromStorage, getDefaultVisible)

  const toggle = useCallback((key: ColumnKey) => {
    const current = readFromStorage()
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key]
    writeToStorage(next)
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new Event('column-prefs-change'))
  }, [])

  return { visibleKeys, toggle, reset }
}
