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
import { getPayload } from 'payload'

import { getStaffLoad } from '@/lib/queries'

import config from '@payload-config'


export default async function StaffPage() {
  const payload = await getPayload({ config })
  const staff = await getStaffLoad(payload)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">인력 현황</h1>

      <Card>
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
            {staff.map(s => {
              const alloc = Number(s.total_allocation)
              const color =
                alloc > 100 ? 'red' : alloc >= 80 ? 'amber' : 'blue'
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <Text className="font-medium">{s.name}</Text>
                  </TableCell>
                  <TableCell>{s.role || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={Math.min(alloc, 100)}
                        color={color}
                        className="w-24"
                      />
                      <Badge color={color}>{alloc}%</Badge>
                    </div>
                  </TableCell>
                  <TableCell>{s.active_projects}</TableCell>
                </TableRow>
              )
            })}
            {staff.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-gray-500"
                >
                  등록된 인력이 없습니다
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
