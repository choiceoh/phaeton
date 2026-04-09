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

import { WarmBadge } from '@/components/WarmBadge'
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/constants'
import { fmtNum, formatCodTarget } from '@/lib/format'
import type { ProjectProgress } from '@/lib/types'

function SortIcon({ column, sort }: { column: string; sort: string }) {
  const active = sort === column || sort === `-${column}`
  if (!active) return <span className="ml-1 text-stone-300">{'\u2195'}</span>
  return <span className="ml-1">{sort.startsWith('-') ? '\u2193' : '\u2191'}</span>
}

const SORTABLE_COLUMNS = new Set(['name', 'capacity_kw', 'progress', 'cod_target'])

const columns: ColumnDef<ProjectProgress>[] = [
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
    accessorKey: 'type',
    header: '유형',
    cell: ({ row }) => (
      <WarmBadge>{PROJECT_TYPE_LABELS[row.original.type] || row.original.type}</WarmBadge>
    ),
  },
  {
    accessorKey: 'status',
    header: '상태',
    cell: ({ row }) => (
      <WarmBadge>{PROJECT_STATUS_LABELS[row.original.status] || row.original.status}</WarmBadge>
    ),
  },
  {
    id: 'capacity_kw',
    accessorKey: 'capacity_kw',
    header: '용량(kW)',
    cell: ({ row }) =>
      row.original.capacity_kw !== null && row.original.capacity_kw !== undefined
        ? fmtNum(row.original.capacity_kw)
        : '-',
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
    cell: ({ row }) => (row.original.cod_target ? formatCodTarget(row.original.cod_target) : '-'),
  },
]

export function ProjectTable({
  projects,
  sort = '',
  onSort,
}: {
  projects: ProjectProgress[]
  sort?: string
  onSort?: (col: string) => void
}) {
  const table = useReactTable({
    data: projects,
    columns,
    getCoreRowModel: getCoreRowModel(),
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
