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

export function AlertsView({
  overdue,
  expiring,
  overloaded,
}: {
  overdue: OverdueItem[]
  expiring: ExpiringItem[]
  overloaded: StaffItem[]
}) {
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
              <TableHeaderCell>프로젝트</TableHeaderCell>
              <TableHeaderCell>마감일</TableHeaderCell>
              <TableHeaderCell>지연</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {overdue.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.name}</TableCell>
                <TableCell>
                  <Link
                    href={`/projects/${m.project_id}`}
                    className="text-blue-600 hover:underline"
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
                <TableCell colSpan={4} className="text-center text-gray-500">
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
              <TableHeaderCell>프로젝트</TableHeaderCell>
              <TableHeaderCell>유형</TableHeaderCell>
              <TableHeaderCell>만료일</TableHeaderCell>
              <TableHeaderCell>남은 일수</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expiring.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.title}</TableCell>
                <TableCell>
                  <Link
                    href={`/projects/${d.project_id}`}
                    className="text-blue-600 hover:underline"
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
                <TableCell colSpan={5} className="text-center text-gray-500">
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
                <TableCell colSpan={4} className="text-center text-gray-500">
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
