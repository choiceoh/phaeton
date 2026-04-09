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
  Badge,
  ProgressBar,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Text,
} from '@tremor/react'
import { useState } from 'react'

interface StaffRow {
  id: number | string
  name: string
  role: string | null
  total_allocation: number | string
  active_projects: number | string
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <span className="ml-1 text-stone-300">{'\u2195'}</span>
  return <span className="ml-1">{sorted === 'asc' ? '\u2191' : '\u2193'}</span>
}

const columns: ColumnDef<StaffRow>[] = [
  {
    accessorKey: 'name',
    header: '이름',
    cell: ({ row }) => <Text className="font-medium">{row.original.name}</Text>,
  },
  {
    accessorKey: 'role',
    header: '직무',
    cell: ({ row }) => row.original.role || '-',
  },
  {
    id: 'allocation',
    accessorFn: (row) => Number(row.total_allocation),
    header: '할당률',
    cell: ({ row }) => {
      const alloc = Number(row.original.total_allocation)
      const color = alloc > 100 ? 'red' : alloc >= 80 ? 'amber' : 'gray'
      return (
        <div className="flex items-center gap-2">
          <ProgressBar value={Math.min(alloc, 100)} color={color} className="w-24" />
          <Badge color={color}>{alloc}%</Badge>
        </div>
      )
    },
  },
  {
    id: 'projects',
    accessorFn: (row) => Number(row.active_projects),
    header: '프로젝트 수',
  },
]

export function StaffTable({ staff }: { staff: StaffRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data: staff,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Card>
      <Table>
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
          {staff.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-gray-500">
                등록된 인력이 없습니다
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}
