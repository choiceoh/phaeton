'use client'

import {
  Card,
  Text,
  Badge,
  ProgressBar,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@tremor/react'
import { useMemo, useState } from 'react'

interface StaffRow {
  id: number | string
  name: string
  role: string | null
  total_allocation: number | string
  active_projects: number | string
}

type SortKey = 'name' | 'total_allocation' | 'active_projects'

function SortableHeader({
  label,
  column,
  sortKey,
  sortDesc,
  onSort,
}: {
  label: string
  column: SortKey
  sortKey: SortKey
  sortDesc: boolean
  onSort: (key: SortKey) => void
}) {
  const active = sortKey === column
  const indicator = active ? (sortDesc ? ' \u2193' : ' \u2191') : ''
  return (
    <TableHeaderCell
      className="cursor-pointer select-none hover:text-stone-900"
      onClick={() => onSort(column)}
    >
      {label}{indicator}
    </TableHeaderCell>
  )
}

export function StaffTable({ staff }: { staff: StaffRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('total_allocation')
  const [sortDesc, setSortDesc] = useState(true)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const sorted = useMemo(
    () => [...staff].sort((a, b) => {
      if (sortKey === 'name') {
        return sortDesc
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name)
      }
      const av = Number(a[sortKey])
      const bv = Number(b[sortKey])
      return sortDesc ? bv - av : av - bv
    }),
    [staff, sortKey, sortDesc],
  )

  return (
    <Card>
      <Table>
        <TableHead>
          <TableRow>
            <SortableHeader
              label="이름" column="name"
              sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort}
            />
            <TableHeaderCell>직무</TableHeaderCell>
            <SortableHeader
              label="할당률" column="total_allocation"
              sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort}
            />
            <SortableHeader
              label="프로젝트 수" column="active_projects"
              sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort}
            />
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((s) => {
            const alloc = Number(s.total_allocation)
            const color = alloc > 100 ? 'red' : alloc >= 80 ? 'amber' : 'gray'
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <Text className="font-medium">{s.name}</Text>
                </TableCell>
                <TableCell>{s.role || '-'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={Math.min(alloc, 100)} color={color} className="w-24" />
                    <Badge color={color}>{alloc}%</Badge>
                  </div>
                </TableCell>
                <TableCell>{s.active_projects}</TableCell>
              </TableRow>
            )
          })}
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
