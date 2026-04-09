'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button, Card, Select, SelectItem, Text, TextInput } from '@tremor/react'

import {
  DEPARTMENT_LABELS,
  PROJECT_STATUS_LABELS,
} from '@/lib/constants'

import type { UpdateProjectData } from '@/app/(frontend)/projects/[id]/actions'
import { updateProject } from '@/app/(frontend)/projects/[id]/actions'

interface ProjectEditFormProps {
  projectId: string
  initial: {
    name: string
    code: string
    status: string
    department?: string | null
    client?: string | null
    capacityKw?: number | null
    codTarget?: string | null
  }
}

export function ProjectEditForm({ projectId, initial }: ProjectEditFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<UpdateProjectData>({
    name: initial.name,
    status: initial.status,
    department: initial.department ?? '',
    client: initial.client ?? '',
    capacityKw: initial.capacityKw ?? null,
    codTarget: initial.codTarget ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('프로젝트명은 필수입니다')
      return
    }
    setSaving(true)
    setError(null)

    const result = await updateProject(projectId, form)
    setSaving(false)

    if (result.success) {
      router.push(`/projects/${projectId}`)
      router.refresh()
    } else {
      setError(result.error ?? '저장에 실패했습니다')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">프로젝트 수정</h1>
          <Text className="text-gray-500">{initial.code}</Text>
        </div>
        <button
          onClick={() => router.push(`/projects/${projectId}`)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          돌아가기
        </button>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div>
            <label className="mb-1 block text-sm text-gray-600">프로젝트명</label>
            <TextInput
              value={form.name}
              onValueChange={(v) => setForm({ ...form, name: v })}
              placeholder="프로젝트명"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">상태</label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">담당부서</label>
              <Select
                value={form.department ?? ''}
                onValueChange={(v) => setForm({ ...form, department: v })}
              >
                {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">발주처 / 사업주</label>
            <TextInput
              value={form.client ?? ''}
              onValueChange={(v) => setForm({ ...form, client: v })}
              placeholder="발주처 / 사업주"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">설비용량 (kW)</label>
              <TextInput
                type="number"
                value={form.capacityKw != null ? String(form.capacityKw) : ''}
                onValueChange={(v) => setForm({ ...form, capacityKw: v ? Number(v) : null })}
                placeholder="설비용량"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">COD 목표일</label>
              <input
                type="date"
                value={form.codTarget ?? ''}
                onChange={(e) => setForm({ ...form, codTarget: e.target.value || null })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                  focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/projects/${projectId}`)}
              disabled={saving}
            >
              취소
            </Button>
            <Button
              type="submit"
              loading={saving}
            >
              저장
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
