'use client'

import {
  Card,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
} from '@tremor/react'
import Link from 'next/link'

import { WarmBadge } from '@/components/WarmBadge'
import {
  DEPARTMENT_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from '@/lib/constants'
import { formatCodTarget } from '@/lib/format'
import type { ProjectProgress } from '@/lib/types'
import type { ColumnKey } from '@/lib/useColumnPrefs'

function formatEpcValue(val: number | null): string {
  if (val == null) return '-'
  if (val >= 1_0000_0000) return `${(val / 1_0000_0000).toFixed(1)}억`
  if (val >= 1_0000) return `${(val / 1_0000).toFixed(0)}만`
  return val.toLocaleString('ko-KR')
}

function formatNextDue(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / 86400000)
  if (daysLeft < 0) return `${mm}/${dd} (${Math.abs(daysLeft)}일 초과)`
  if (daysLeft === 0) return `${mm}/${dd} (오늘)`
  return `${mm}/${dd} (${daysLeft}일)`
}

function renderCell(key: ColumnKey, p: ProjectProgress) {
  const progress = Number(p.progress_pct) || 0

  switch (key) {
    case 'name':
      return (
        <Link
          href={`/projects/${p.id}`}
          className="font-medium text-gray-900 hover:underline"
        >
          {p.name}
        </Link>
      )
    case 'code':
      return <span className="text-xs text-gray-500">{p.code ?? '-'}</span>
    case 'type':
      return <WarmBadge>{PROJECT_TYPE_LABELS[p.type] || p.type}</WarmBadge>
    case 'status':
      return <WarmBadge>{PROJECT_STATUS_LABELS[p.status] || p.status}</WarmBadge>
    case 'department':
      return DEPARTMENT_LABELS[p.department ?? ''] ?? p.department ?? '-'
    case 'capacity_kw':
      return p.capacity_kw ?? '-'
    case 'progress':
      return (
        <div className="flex min-w-[8rem] items-center gap-2">
          <ProgressBar
            value={progress}
            color={progress === 100 ? 'green' : 'neutral'}
            className="w-20"
            aria-label={`${p.name} 진행률 ${progress}%`}
          />
          <Text className="text-xs">{progress}%</Text>
        </div>
      )
    case 'milestones':
      return `${p.done_milestones}/${p.total_milestones}`
    case 'cod_target':
      return p.cod_target ? formatCodTarget(p.cod_target) : '-'
    case 'next_due': {
      const daysLeft = p.next_due
        ? Math.ceil((new Date(p.next_due).getTime() - Date.now()) / 86400000)
        : null
      return (
        <span className={daysLeft !== null && daysLeft < 0 ? 'text-red-600' : ''}>
          {formatNextDue(p.next_due)}
        </span>
      )
    }
    case 'client':
      return p.client ?? '-'
    case 'pm_name':
      return p.pm_name ?? '-'
    case 'epc_value':
      return formatEpcValue(p.epc_value)
    case 'region':
      return p.region ?? '-'
  }
}

interface ProjectTableProps {
  projects: ProjectProgress[]
  visibleKeys: ColumnKey[]
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: '프로젝트명',
  code: '프로젝트 코드',
  type: '유형',
  status: '상태',
  department: '부서',
  capacity_kw: '용량(kW)',
  progress: '진행률',
  milestones: '마일스톤',
  cod_target: 'COD 목표',
  next_due: '다음 기한',
  client: '발주처',
  pm_name: '담당 PM',
  epc_value: 'EPC 금액',
  region: '지역',
}

export function ProjectTable({ projects, visibleKeys }: ProjectTableProps) {
  return (
    <Card>
      <Table className="[&_td]:py-1.5 [&_th]:py-2">
        <caption className="sr-only">프로젝트 진행 현황</caption>
        <TableHead>
          <TableRow>
            {visibleKeys.map((key) => (
              <TableHeaderCell key={key}>{COLUMN_LABELS[key]}</TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.id}>
              {visibleKeys.map((key) => (
                <TableCell key={key}>{renderCell(key, p)}</TableCell>
              ))}
            </TableRow>
          ))}
          {projects.length === 0 && (
            <TableRow>
              <TableCell colSpan={visibleKeys.length} className="text-center text-gray-500">
                조건에 맞는 프로젝트가 없습니다
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}
