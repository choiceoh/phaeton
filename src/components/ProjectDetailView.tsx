'use client'

import {
  Badge,
  Card,
  Metric,
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
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { deleteAssignment, deleteMilestone } from '@/app/(frontend)/projects/[id]/actions'
import { AssignmentForm } from '@/components/AssignmentForm'
import { DocumentUploadForm } from '@/components/DocumentUploadForm'
import { MilestoneInlineForm } from '@/components/MilestoneInlineForm'
import { MilestoneTimeline } from '@/components/MilestoneTimeline'
import {
  DOC_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_COLORS,
  PROJECT_TYPE_LABELS,
} from '@/lib/constants'
import { fmtNum, formatCodTarget } from '@/lib/format'

interface StaffOption {
  id: number
  name: string
}

interface MilestoneItem {
  id: number | string
  name: string
  status: string
  plannedDate: string | null
  actualDate: string | null
  dueDate: string | null
  seqOrder: number
  assignee: { id: number; name: string } | null
  template: { category: string } | null
  note?: string | null
}

interface AssignmentItem {
  id: number | string
  staff: { id: number; name: string } | number | null
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
  id: string | number
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
  staffList = [],
  canEdit = false,
}: {
  project: ProjectData
  milestones: MilestoneItem[]
  assignments: AssignmentItem[]
  documents: DocumentItem[]
  staffList?: StaffOption[]
  canEdit?: boolean
}) {
  const router = useRouter()
  const total = milestones.length
  const done = milestones.filter((m) => m.status === 'done').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<MilestoneItem | null>(null)
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDeleteMilestone(id: number) {
    if (!confirm('마일스톤을 삭제하시겠습니까?')) return
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteMilestone(id)
      setDeletingId(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('마일스톤이 삭제되었습니다')
      router.refresh()
    })
  }

  function handleDeleteAssignment(id: number) {
    if (!confirm('인력 배정을 삭제하시겠습니까?')) return
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteAssignment(id, String(project.id))
      setDeletingId(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('배정이 삭제되었습니다')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Text className="text-gray-500">{project.code}</Text>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={PROJECT_TYPE_COLORS[project.type] || 'gray'}>
              {PROJECT_TYPE_LABELS[project.type] || project.type}
            </Badge>
            <Badge color="gray">{PROJECT_STATUS_LABELS[project.status] || project.status}</Badge>
            <Link
              href={`/projects/${project.id}/edit`}
              className="ml-2 rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
            >
              수정
            </Link>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Text className="text-xs text-gray-500">설비용량</Text>
            <Metric className="text-lg">
              {project.capacityKw ? `${fmtNum(project.capacityKw)} kW` : '-'}
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
            <Metric className="text-lg">{project.client || '-'}</Metric>
          </div>
        </div>

        <ProgressBar value={pct} color={pct === 100 ? 'green' : 'neutral'} />
        <Text className="mt-1 text-xs text-gray-500">
          {done}/{total} 마일스톤 완료
        </Text>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── 마일스톤 ───────────────────────────── */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <Text className="font-medium">마일스톤 타임라인</Text>
            {canEdit && (
              <button
                onClick={() => {
                  setEditingMilestone(null)
                  setShowMilestoneForm(true)
                }}
                className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700"
              >
                마일스톤 추가
              </button>
            )}
          </div>

          {showMilestoneForm && !editingMilestone && (
            <div className="mb-4">
              <MilestoneInlineForm
                projectId={String(project.id)}
                staffList={staffList}
                onClose={() => setShowMilestoneForm(false)}
              />
            </div>
          )}

          {milestones.map((m) => (
            <div key={m.id}>
              {editingMilestone?.id === m.id ? (
                <div className="mb-4">
                  <MilestoneInlineForm
                    projectId={String(project.id)}
                    milestone={{
                      id: Number(m.id),
                      name: m.name,
                      status: m.status,
                      plannedDate: m.plannedDate,
                      dueDate: m.dueDate,
                      assignee: m.assignee,
                      note: m.note,
                    }}
                    staffList={staffList}
                    onClose={() => setEditingMilestone(null)}
                  />
                </div>
              ) : (
                canEdit && (
                  <div className="-mb-1 flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setShowMilestoneForm(false)
                        setEditingMilestone(m)
                      }}
                      className="text-xs text-stone-400 hover:text-stone-600"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteMilestone(Number(m.id))}
                      disabled={isPending && deletingId === Number(m.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      삭제
                    </button>
                  </div>
                )
              )}
            </div>
          ))}

          <MilestoneTimeline milestones={milestones} />
        </Card>

        <div className="space-y-6">
          {/* ── 배정 인력 ──────────────────────────── */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <Text className="font-medium">배정 인력</Text>
              {canEdit && (
                <button
                  onClick={() => setShowAssignmentForm(true)}
                  className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700"
                >
                  인력 배정
                </button>
              )}
            </div>

            {showAssignmentForm && (
              <div className="mb-4">
                <AssignmentForm
                  projectId={String(project.id)}
                  staffList={staffList}
                  onClose={() => setShowAssignmentForm(false)}
                />
              </div>
            )}

            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>이름</TableHeaderCell>
                  <TableHeaderCell>역할</TableHeaderCell>
                  <TableHeaderCell>할당률</TableHeaderCell>
                  <TableHeaderCell>기간</TableHeaderCell>
                  {canEdit && <TableHeaderCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {typeof a.staff === 'object' && a.staff ? a.staff.name : '-'}
                    </TableCell>
                    <TableCell>{a.roleOnProject || '-'}</TableCell>
                    <TableCell>
                      <Badge color={Number(a.allocationPct) > 100 ? 'red' : 'gray'}>
                        {fmtNum(a.allocationPct)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.startDate || '-'} ~ {a.endDate || '진행중'}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <button
                          onClick={() => handleDeleteAssignment(Number(a.id))}
                          disabled={isPending && deletingId === Number(a.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          삭제
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {assignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 5 : 4} className="text-center text-gray-500">
                      배정된 인력이 없습니다
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* ── 서류 ───────────────────────────────── */}
          <Card>
            <Text className="mb-4 font-medium">서류 목록</Text>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>서류명</TableHeaderCell>
                  <TableHeaderCell>유형</TableHeaderCell>
                  <TableHeaderCell>만료일</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map((d) => {
                  const expSoon =
                    d.expiryDate && new Date(d.expiryDate).getTime() < Date.now() + 90 * 86400000
                  return (
                    <TableRow key={d.id}>
                      <TableCell>{d.title}</TableCell>
                      <TableCell>
                        <Badge color="gray">{DOC_TYPE_LABELS[d.docType] || d.docType}</Badge>
                      </TableCell>
                      <TableCell>
                        {d.expiryDate ? (
                          <Badge color={expSoon ? 'amber' : 'gray'}>{d.expiryDate}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {documents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-500">
                      서류가 없습니다
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <DocumentUploadForm projectId={String(project.id)} />
          </Card>
        </div>
      </div>
    </div>
  )
}
