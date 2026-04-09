'use client'

import { Button, Select, SelectItem, TextInput } from '@tremor/react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { createAssignment, type AssignmentFormData } from '@/app/(frontend)/projects/[id]/actions'

interface StaffOption {
  id: number
  name: string
}

interface Props {
  projectId: string
  staffList: StaffOption[]
  onClose: () => void
}

export function AssignmentForm({ projectId, staffList, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [staff, setStaff] = useState('')
  const [roleOnProject, setRoleOnProject] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [allocationPct, setAllocationPct] = useState('100')
  const [note, setNote] = useState('')

  function handleSubmit() {
    if (!staff) {
      toast.error('인력을 선택해 주세요')
      return
    }
    if (!startDate) {
      toast.error('시작일을 입력해 주세요')
      return
    }

    const data: AssignmentFormData = {
      staff: Number(staff),
      roleOnProject: roleOnProject || undefined,
      startDate,
      endDate: endDate || null,
      allocationPct: allocationPct ? Number(allocationPct) : 100,
      note: note || undefined,
    }

    startTransition(async () => {
      const result = await createAssignment(projectId, data)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('인력이 배정되었습니다')
      onClose()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-medium">인력 배정</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500">인력</label>
          <Select value={staff} onValueChange={setStaff} placeholder="인력 선택">
            {staffList.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">역할</label>
          <TextInput
            value={roleOnProject}
            onValueChange={setRoleOnProject}
            placeholder="PM, 전기, 토목 등"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">종료일</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">할당률 (%)</label>
          <TextInput type="number" value={allocationPct} onValueChange={setAllocationPct} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-500">비고</label>
        <TextInput value={note} onValueChange={setNote} placeholder="비고" />
      </div>

      <div className="flex gap-2">
        <Button size="xs" variant="primary" color="blue" onClick={handleSubmit} loading={isPending}>
          배정
        </Button>
        <Button size="xs" variant="secondary" color="gray" onClick={onClose}>
          취소
        </Button>
      </div>
    </div>
  )
}
