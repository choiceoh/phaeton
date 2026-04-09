'use client'

import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table'
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
import { useMemo } from 'react'

import { WarmBadge } from '@/components/WarmBadge'
import {
  DEPARTMENT_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from '@/lib/constants'
import { daysFromNow, fmtNum, formatCodTarget, formatDate } from '@/lib/format'
import type { ProjectProgress } from '@/lib/types'
import type { ColumnKey } from '@/lib/useColumnPrefs'

function SortIcon({ column, sort }: { column: string; sort: string }) {
  const active = sort === column || sort === `-${column}`
  if (!active) return <span className="ml-1 text-stone-300">{'\u2195'}</span>
  return <span className="ml-1">{sort.startsWith('-') ? '\u2193' : '\u2191'}</span>
}

const SORTABLE_COLUMNS = new Set(['name', 'capacity_kw', 'progress', 'cod_target'])

const allColumns: (ColumnDef<ProjectProgress> & { id: ColumnKey })[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: '프로젝트명',
    cell: ({ row }) => (
      <Link
        href={`/projects/${row.original.id}`}
        className="font-medium text-gray-900 hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: 'code',
    accessorKey: 'code',
    header: '프로젝트 코드',
    cell: ({ row }) => (
      <span className="text-xs text-gray-500">{row.original.code ?? '-'}</span>
    ),
  },
  {
    id: 'type',
    accessorKey: 'type',
    header: '유형',
    cell: ({ row }) => (
      <WarmBadge>{PROJECT_TYPE_LABELS[row.original.type] || row.original.type}</WarmBadge>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: '상태',
    cell: ({ row }) => (
      <WarmBadge>
        {PROJECT_STATUS_LABELS[row.original.status] || row.original.status}
      </WarmBadge>
    ),
  },
  {
    id: 'department',
    accessorKey: 'department',
    header: '부서',
    cell: ({ row }) =>
      DEPARTMENT_LABELS[row.original.department ?? ''] ?? row.original.department ?? '-',
  },
  {
    id: 'capacity_kw',
    accessorKey: 'capacity_kw',
    header: '용량(kW)',
    cell: ({ row }) =>
      row.original.capacity_kw != null ? fmtNum(row.original.capacity_kw) : '-',
  },
  {
    id: 'progress',
    accessorFn: (row) => Number(row.progress_pct) || 0,
    header: '진행률',
    cell: ({ row }) => {
      const progress = Number(row.original.progress_pct) || 0
      return (
        <div className="flex min-w-[8rem] items-center gap-2">
          <ProgressBar
            value={progress}
            color={progress === 100 ? 'green' : 'neutral'}
            className="w-20"
            aria-label={`${row.original.name} 진행률 ${progress}%`}
          />
          <Text className="text-xs">{progress}%</Text>
        </div>
      )
    },
  },
  {
    id: 'milestones',
    accessorFn: (row) => Number(row.done_milestones) / (Number(row.total_milestones) || 1),
    header: '마일스톤',
    cell: ({ row }) => `${row.original.done_milestones}/${row.original.total_milestones}`,
  },
  {
    id: 'cod_target',
    accessorKey: 'cod_target',
    header: 'COD 목표',
    cell: ({ row }) =>
      row.original.cod_target ? formatCodTarget(row.original.cod_target) : '-',
  },
  {
    id: 'next_due',
    accessorKey: 'next_due',
    header: '다음 기한',
    cell: ({ row }) => {
      const d = row.original.next_due
      if (!d) return '-'
      const days = daysFromNow(d)
      return (
        <span className={days < 0 ? 'text-red-600' : ''}>
          {formatDate(d, 'MM/dd')}
          {' '}
          ({days < 0 ? `${Math.abs(days)}일 초과` : days === 0 ? '오늘' : `${days}일`})
        </span>
      )
    },
  },
  {
    id: 'client',
    accessorKey: 'client',
    header: '발주처',
    cell: ({ row }) => row.original.client ?? '-',
  },
  {
    id: 'pm_name',
    accessorKey: 'pm_name',
    header: '담당 PM',
    cell: ({ row }) => row.original.pm_name ?? '-',
  },
  {
    id: 'epc_value',
    accessorKey: 'epc_value',
    header: 'EPC 금액',
    cell: ({ row }) => {
      const val = row.original.epc_value
      if (val == null) return '-'
      if (val >= 1_0000_0000) return `${(val / 1_0000_0000).toFixed(1)}억`
      if (val >= 1_0000) return `${(val / 1_0000).toFixed(0)}만`
      return fmtNum(val)
    },
  },
  {
    id: 'region',
    accessorKey: 'region',
    header: '지역',
    cell: ({ row }) => row.original.region ?? '-',
  },
]

export function ProjectTable({
  projects,
  visibleKeys,
  sort = '',
  onSort,
}: {
  projects: ProjectProgress[]
  visibleKeys: ColumnKey[]
  sort?: string
  onSort?: (col: string) => void
}) {
  const columnVisibility = useMemo(() => {
    const vis: Record<string, boolean> = {}
    for (const col of allColumns) {
      vis[col.id] = visibleKeys.includes(col.id)
    }
    return vis
  }, [visibleKeys])

  const table = useReactTable({
    data: projects,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility },
  })

  return (
    <Card>
      <Table className="[&_td]:py-1.5 [&_th]:py-2">
        <caption className="sr-only">프로젝트 진행 현황</caption>
        <TableHead>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const colId = header.column.id
                const sortable = SORTABLE_COLUMNS.has(colId) && onSort
                return (
                  <TableHeaderCell
                    key={header.id}
                    className={sortable ? 'cursor-pointer select-none' : ''}
                    onClick={
                      sortable
                        ? () => onSort(colId === 'progress' ? 'progress_pct' : colId)
                        : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sortable && (
                      <SortIcon
                        column={colId === 'progress' ? 'progress_pct' : colId}
                        sort={sort}
                      />
                    )}
                  </TableHeaderCell>
                )
              })}
            </TableRow>
          ))}
        </TableHead>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {projects.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={visibleKeys.length}
                className="text-center text-gray-500"
              >
                조건에 맞는 프로젝트가 없습니다
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}
