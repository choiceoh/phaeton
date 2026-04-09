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
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/constants'
import { formatCodTarget } from '@/lib/format'
import type { ProjectProgress } from '@/lib/types'

interface SortableHeaderProps {
  label: string
  column: string
  sort: string
  onSort: (col: string) => void
}

function SortableHeader({ label, column, sort, onSort }: SortableHeaderProps) {
  const active = sort === column || sort === `-${column}`
  const desc = sort === `-${column}`
  const indicator = active ? (desc ? ' \u2193' : ' \u2191') : ''

  return (
    <TableHeaderCell
      className="cursor-pointer select-none hover:text-stone-900"
      onClick={() => onSort(column)}
    >
      {label}{indicator}
    </TableHeaderCell>
  )
}

export function ProjectTable({
  projects,
  sort = '',
  onSort,
}: {
  projects: ProjectProgress[]
  sort?: string
  onSort?: (col: string) => void
}) {
  const handleSort = onSort || (() => {})

  return (
    <Card>
      <Table className="[&_td]:py-1.5 [&_th]:py-2">
        <caption className="sr-only">프로젝트 진행 현황</caption>
        <TableHead>
          <TableRow>
            <SortableHeader label="프로젝트명" column="name" sort={sort} onSort={handleSort} />
            <TableHeaderCell>유형</TableHeaderCell>
            <TableHeaderCell>상태</TableHeaderCell>
            <SortableHeader
              label="용량(kW)"
              column="capacity_kw"
              sort={sort}
              onSort={handleSort}
            />
            <SortableHeader
              label="진행률"
              column="progress_pct"
              sort={sort}
              onSort={handleSort}
            />
            <TableHeaderCell>마일스톤</TableHeaderCell>
            <SortableHeader
              label="COD 목표"
              column="cod_target"
              sort={sort}
              onSort={handleSort}
            />
          </TableRow>
        </TableHead>
        <TableBody>
          {projects.map((p) => {
            const progress = Number(p.progress_pct) || 0
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/projects/${p.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <WarmBadge>{PROJECT_TYPE_LABELS[p.type] || p.type}</WarmBadge>
                </TableCell>
                <TableCell>
                  <WarmBadge>{PROJECT_STATUS_LABELS[p.status] || p.status}</WarmBadge>
                </TableCell>
                <TableCell>{p.capacity_kw ?? '-'}</TableCell>
                <TableCell>
                  <div className="flex min-w-[8rem] items-center gap-2">
                    <ProgressBar
                      value={progress}
                      color={progress === 100 ? 'green' : 'neutral'}
                      className="w-20"
                      aria-label={`${p.name} 진행률 ${progress}%`}
                    />
                    <Text className="text-xs">{progress}%</Text>
                  </div>
                </TableCell>
                <TableCell>
                  {p.done_milestones}/{p.total_milestones}
                </TableCell>
                <TableCell>{p.cod_target ? formatCodTarget(p.cod_target) : '-'}</TableCell>
              </TableRow>
            )
          })}
          {projects.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-500">
                조건에 맞는 프로젝트가 없습니다
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}
