'use client'

import { Button, Select, SelectItem, TextInput } from '@tremor/react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  createMilestone,
  updateMilestone,
  type MilestoneFormData,
} from '@/app/(frontend)/projects/[id]/actions'
import { MILESTONE_STATUS_LABELS } from '@/lib/constants'

interface StaffOption {
  id: number
  name: string
}

interface MilestoneData {
  id: number
  name: string
  status: string
  plannedDate?: string | null
  dueDate?: string | null
  assignee?: { id: number; name: string } | null
  note?: string | null
}

interface Props {
  projectId: string
  milestone?: MilestoneData
  staffList: StaffOption[]
  onClose: () => void
}

export function MilestoneInlineForm({ projectId, milestone, staffList, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!milestone

  const [name, setName] = useState(milestone?.name ?? '')
  const [status, setStatus] = useState(milestone?.status ?? 'pending')
  const [plannedDate, setPlannedDate] = useState(milestone?.plannedDate ?? '')
  const [dueDate, setDueDate] = useState(milestone?.dueDate ?? '')
  const [assignee, setAssignee] = useState(milestone?.assignee ? String(milestone.assignee.id) : '')
  const [note, setNote] = useState(milestone?.note ?? '')

  function handleSubmit() {
    if (!name.trim()) {
      toast.error('마일스톤명을 입력해 주세요')
      return
    }

    const data: MilestoneFormData = {
      name,
      status,
      plannedDate: plannedDate || null,
      dueDate: dueDate || null,
      assignee: assignee ? Number(assignee) : null,
      note: note || undefined,
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateMilestone(milestone!.id, data)
        : await createMilestone(projectId, data)

      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(isEdit ? '마일스톤이 수정되었습니다' : '마일스톤이 추가되었습니다')
      onClose()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-medium">{isEdit ? '마일스톤 수정' : '마일스톤 추가'}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput placeholder="마일스톤명" value={name} onValueChange={setName} />
        <Select value={status} onValueChange={setStatus}>
          {Object.entries(MILESTONE_STATUS_LABELS).map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500">계획일</label>
          <input
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">마감일</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500">담당자</label>
          <Select value={assignee} onValueChange={setAssignee} placeholder="담당자 선택">
            {staffList.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">비고</label>
          <TextInput value={note} onValueChange={setNote} placeholder="비고" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="xs" variant="primary" color="blue" onClick={handleSubmit} loading={isPending}>
          {isEdit ? '수정' : '추가'}
        </Button>
        <Button size="xs" variant="secondary" color="gray" onClick={onClose}>
          취소
        </Button>
      </div>
    </div>
  )
}
