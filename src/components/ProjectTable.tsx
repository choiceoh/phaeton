'use client'

import {
  Badge,
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

import { PROJECT_STATUS_LABELS, PROJECT_TYPE_COLORS, PROJECT_TYPE_LABELS } from '@/lib/constants'
import { formatCodTarget } from '@/lib/format'
import type { ProjectProgress } from '@/lib/types'

export function ProjectTable({ projects }: { projects: ProjectProgress[] }) {
  return (
    <Card>
      <Table className="[&_td]:py-1.5 [&_th]:py-2">
        <TableHead>
          <TableRow>
            <TableHeaderCell>프로젝트명</TableHeaderCell>
            <TableHeaderCell>유형</TableHeaderCell>
            <TableHeaderCell>상태</TableHeaderCell>
            <TableHeaderCell>용량(kW)</TableHeaderCell>
            <TableHeaderCell>진행률</TableHeaderCell>
            <TableHeaderCell>마일스톤</TableHeaderCell>
            <TableHeaderCell>COD 목표</TableHeaderCell>
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
                  <Badge color={PROJECT_TYPE_COLORS[p.type] || 'gray'}>
                    {PROJECT_TYPE_LABELS[p.type] || p.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge color="gray">{PROJECT_STATUS_LABELS[p.status] || p.status}</Badge>
                </TableCell>
                <TableCell>{p.capacity_kw ?? '-'}</TableCell>
                <TableCell>
                  <div className="flex min-w-[8rem] items-center gap-2">
                    <ProgressBar
                      value={progress}
                      color={progress === 100 ? 'green' : 'blue'}
                      className="w-20"
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
