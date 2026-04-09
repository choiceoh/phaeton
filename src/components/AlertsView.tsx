'use client'

import {
  Card,
  Text,
  Badge,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@tremor/react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { DOC_TYPE_LABELS } from '@/lib/constants'

interface OverdueItem {
  id: number | string
  name: string
  project_id: number | string
  project_name: string
  due_date: string
  days_overdue: number | string
}

interface ExpiringItem {
  id: number | string
  title: string
  project_id: number | string
  project_name: string
  doc_type: string
  expiry_date: string
  days_until_expiry: number | string
}

interface StaffItem {
  id: number | string
  name: string
  role: string | null
  total_allocation: number | string
  active_projects: number | string
}

type SortDir = 'asc' | 'desc'

function useSortable<K extends string>(defaultKey: K, defaultDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<K>(defaultKey)
  const [sortDesc, setSortDesc] = useState(defaultDir === 'desc')

  function toggle(key: K) {
    if (sortKey === key) setSortDesc((d) => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  return { sortKey, sortDesc, toggle }
}

function SortHeader<K extends string>({
  label,
  column,
  sortKey,
  sortDesc,
  onSort,
}: {
  label: string
  column: K
  sortKey: K
  sortDesc: boolean
  onSort: (k: K) => void
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

export function AlertsView({
  overdue,
  expiring,
  overloaded,
}: {
  overdue: OverdueItem[]
  expiring: ExpiringItem[]
  overloaded: StaffItem[]
}) {
  const od = useSortable<'days_overdue' | 'due_date' | 'project_name'>('days_overdue')
  const ex = useSortable<'days_until_expiry' | 'expiry_date' | 'project_name'>('days_until_expiry')

  const sortedOverdue = useMemo(
    () => [...overdue].sort((a, b) => {
      if (od.sortKey === 'project_name') {
        const cmp = a.project_name.localeCompare(b.project_name)
        return od.sortDesc ? -cmp : cmp
      }
      const av = od.sortKey === 'days_overdue'
        ? Number(a.days_overdue) : new Date(a.due_date).getTime()
      const bv = od.sortKey === 'days_overdue'
        ? Number(b.days_overdue) : new Date(b.due_date).getTime()
      return od.sortDesc ? bv - av : av - bv
    }),
    [overdue, od.sortKey, od.sortDesc],
  )

  const sortedExpiring = useMemo(
    () => [...expiring].sort((a, b) => {
      if (ex.sortKey === 'project_name') {
        const cmp = a.project_name.localeCompare(b.project_name)
        return ex.sortDesc ? -cmp : cmp
      }
      const av = ex.sortKey === 'days_until_expiry'
        ? Number(a.days_until_expiry) : new Date(a.expiry_date).getTime()
      const bv = ex.sortKey === 'days_until_expiry'
        ? Number(b.days_until_expiry) : new Date(b.expiry_date).getTime()
      return ex.sortDesc ? bv - av : av - bv
    }),
    [expiring, ex.sortKey, ex.sortDesc],
  )

  return (
    <div className="space-y-6" aria-live="polite">
      <h2 className="text-2xl font-bold">알림 센터</h2>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Text className="text-lg font-medium">지연 마일스톤</Text>
          <Badge color="red">{overdue.length}</Badge>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>마일스톤</TableHeaderCell>
              <SortHeader
                label="프로젝트" column="project_name"
                sortKey={od.sortKey} sortDesc={od.sortDesc} onSort={od.toggle}
              />
              <SortHeader
                label="마감일" column="due_date"
                sortKey={od.sortKey} sortDesc={od.sortDesc} onSort={od.toggle}
              />
              <SortHeader
                label="지연" column="days_overdue"
                sortKey={od.sortKey} sortDesc={od.sortDesc} onSort={od.toggle}
              />
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedOverdue.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.name}</TableCell>
                <TableCell>
                  <Link
                    href={`/projects/${m.project_id}`}
                    className="text-stone-700 underline underline-offset-2"
                  >
                    {m.project_name}
                  </Link>
                </TableCell>
                <TableCell>{m.due_date}</TableCell>
                <TableCell>
                  <Badge color="red">{m.days_overdue}일</Badge>
                </TableCell>
              </TableRow>
            ))}
            {overdue.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-stone-500">
                  지연된 마일스톤이 없습니다
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Text className="text-lg font-medium">만료 임박 서류</Text>
          <Badge color="amber">{expiring.length}</Badge>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>서류명</TableHeaderCell>
              <SortHeader
                label="프로젝트" column="project_name"
                sortKey={ex.sortKey} sortDesc={ex.sortDesc} onSort={ex.toggle}
              />
              <TableHeaderCell>유형</TableHeaderCell>
              <SortHeader
                label="만료일" column="expiry_date"
                sortKey={ex.sortKey} sortDesc={ex.sortDesc} onSort={ex.toggle}
              />
              <SortHeader
                label="남은 일수" column="days_until_expiry"
                sortKey={ex.sortKey} sortDesc={ex.sortDesc} onSort={ex.toggle}
              />
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedExpiring.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.title}</TableCell>
                <TableCell>
                  <Link
                    href={`/projects/${d.project_id}`}
                    className="text-stone-700 underline underline-offset-2"
                  >
                    {d.project_name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge color="gray">{DOC_TYPE_LABELS[d.doc_type] || d.doc_type}</Badge>
                </TableCell>
                <TableCell>{d.expiry_date}</TableCell>
                <TableCell>
                  <Badge color="amber">{d.days_until_expiry}일</Badge>
                </TableCell>
              </TableRow>
            ))}
            {expiring.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-stone-500">
                  만료 임박 서류가 없습니다
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Text className="text-lg font-medium">과할당 인력</Text>
          <Badge color="red">{overloaded.length}</Badge>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>이름</TableHeaderCell>
              <TableHeaderCell>직무</TableHeaderCell>
              <TableHeaderCell>할당률</TableHeaderCell>
              <TableHeaderCell>프로젝트 수</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {overloaded.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.role || '-'}</TableCell>
                <TableCell>
                  <Badge color="red">{s.total_allocation}%</Badge>
                </TableCell>
                <TableCell>{s.active_projects}</TableCell>
              </TableRow>
            ))}
            {overloaded.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-stone-500">
                  과할당 인력이 없습니다
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
