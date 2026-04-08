'use client'

import {
  Card,
  Metric,
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

import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  DOC_TYPE_LABELS,
} from '@/lib/constants'
import { formatCodTarget } from '@/lib/format'

interface MilestoneItem {
  id: number | string
  name: string
  status: string
  plannedDate: string | null
  actualDate: string | null
  dueDate: string | null
  seqOrder: number
  assignee: { name: string } | null
  template: { category: string } | null
}

interface AssignmentItem {
  id: number | string
  staff: { name: string } | number | null
  roleOnProject?: string | null
  allocationPct?: number | null
  startDate?: string | null
  endDate?: string | null
}

interface DocumentItem {
  id: number | string
  title: string
  docType: string
  expiryDate?: string | null
}

interface ProjectData {
  name: string
  code: string
  type: string
  status: string
  capacityKw?: number | null
  codTarget?: string | null
  client?: string | null
}

export function ProjectDetailView({
  project,
  milestones,
  assignments,
  documents,
}: {
  project: ProjectData
  milestones: MilestoneItem[]
  assignments: AssignmentItem[]
  documents: DocumentItem[]
}) {
  const total = milestones.length
  const done = milestones.filter(m => m.status === 'done').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Text className="text-gray-500">{project.code}</Text>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              color={PROJECT_TYPE_COLORS[project.type] || 'gray'}
            >
              {PROJECT_TYPE_LABELS[project.type] || project.type}
            </Badge>
            <Badge color="gray">
              {PROJECT_STATUS_LABELS[project.status] || project.status}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <Text className="text-xs text-gray-500">설비용량</Text>
            <Metric className="text-lg">
              {project.capacityKw ? `${project.capacityKw} kW` : '-'}
            </Metric>
          </div>
          <div>
            <Text className="text-xs text-gray-500">진행률</Text>
            <Metric className="text-lg">{pct}%</Metric>
          </div>
          <div>
            <Text className="text-xs text-gray-500">COD 목표</Text>
            <Metric className="text-lg">
              {project.codTarget ? formatCodTarget(project.codTarget) : '-'}
            </Metric>
          </div>
          <div>
            <Text className="text-xs text-gray-500">발주처</Text>
            <Metric className="text-lg">
              {project.client || '-'}
            </Metric>
          </div>
        </div>

        <ProgressBar
          value={pct}
          color={pct === 100 ? 'green' : 'blue'}
        />
        <Text className="text-xs text-gray-500 mt-1">
          {done}/{total} 마일스톤 완료
        </Text>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <Text className="font-medium mb-4">마일스톤 타임라인</Text>
          <MilestoneTimeline milestones={milestones} />
        </Card>

        <div className="space-y-6">
          <Card>
            <Text className="font-medium mb-4">배정 인력</Text>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>이름</TableHeaderCell>
                  <TableHeaderCell>역할</TableHeaderCell>
                  <TableHeaderCell>할당률</TableHeaderCell>
                  <TableHeaderCell>기간</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {typeof a.staff === 'object' && a.staff
                        ? a.staff.name
                        : '-'}
                    </TableCell>
                    <TableCell>{a.roleOnProject || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        color={
                          Number(a.allocationPct) > 100
                            ? 'red'
                            : 'blue'
                        }
                      >
                        {a.allocationPct}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.startDate || '-'} ~ {a.endDate || '진행중'}
                    </TableCell>
                  </TableRow>
                ))}
                {assignments.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-gray-500"
                    >
                      배정된 인력이 없습니다
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <Text className="font-medium mb-4">서류 목록</Text>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>서류명</TableHeaderCell>
                  <TableHeaderCell>유형</TableHeaderCell>
                  <TableHeaderCell>만료일</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map(d => {
                  const expSoon =
                    d.expiryDate &&
                    new Date(d.expiryDate).getTime() <
                      Date.now() + 90 * 86400000
                  return (
                    <TableRow key={d.id}>
                      <TableCell>{d.title}</TableCell>
                      <TableCell>
                        <Badge color="gray">
                          {DOC_TYPE_LABELS[d.docType] || d.docType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {d.expiryDate ? (
                          <Badge color={expSoon ? 'amber' : 'gray'}>
                            {d.expiryDate}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {documents.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-gray-500"
                    >
                      서류가 없습니다
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  )
}
