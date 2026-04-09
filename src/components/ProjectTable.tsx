'use client'

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table'
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
import { useState } from 'react'

import { WarmBadge } from '@/components/WarmBadge'
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/constants'
import { fmtNum, formatCodTarget } from '@/lib/format'
import type { ProjectProgress } from '@/lib/types'

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <span className="ml-1 text-stone-300">↕</span>
  return <span className="ml-1">{sorted === 'asc' ? '↑' : '↓'}</span>
}

const columns: ColumnDef<ProjectProgress>[] = [
  {
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
    sortingFn: (a, b) => {
      const la = PROJECT_TYPE_LABELS[a.original.type] || a.original.type
      const lb = PROJECT_TYPE_LABELS[b.original.type] || b.original.type
      return la.localeCompare(lb, 'ko')
    },
  },
  {
    accessorKey: 'status',
    header: '상태',
    cell: ({ row }) => (
      <WarmBadge>
        {PROJECT_STATUS_LABELS[row.original.status] || row.original.status}
      </WarmBadge>
    ),
    sortingFn: (a, b) => {
      const la = PROJECT_STATUS_LABELS[a.original.status] || a.original.status
      const lb = PROJECT_STATUS_LABELS[b.original.status] || b.original.status
      return la.localeCompare(lb, 'ko')
    },
  },
  {
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
    accessorFn: (row) =>
      Number(row.done_milestones) / (Number(row.total_milestones) || 1),
    header: '마일스톤',
    cell: ({ row }) =>
      `${row.original.done_milestones}/${row.original.total_milestones}`,
  },
  {
    accessorKey: 'cod_target',
    header: 'COD 목표',
    cell: ({ row }) =>
      row.original.cod_target ? formatCodTarget(row.original.cod_target) : '-',
  },
]

export function ProjectTable({ projects }: { projects: ProjectProgress[] }) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data: projects,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Card>
      <Table className="[&_td]:py-1.5 [&_th]:py-2">
        <caption className="sr-only">프로젝트 진행 현황</caption>
        <TableHead>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHeaderCell
                  key={header.id}
                  className="cursor-pointer select-none"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  <SortIcon sorted={header.column.getIsSorted()} />
                </TableHeaderCell>
              ))}
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
