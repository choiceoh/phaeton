'use client'

import { Button, Card, Select, SelectItem, Text, TextInput } from '@tremor/react'
import { useState } from 'react'
import { toast } from 'sonner'

import { updateProfile, type UpdateProfileData } from '@/app/(frontend)/profile/actions'
import { DEPARTMENT_LABELS } from '@/lib/constants'

interface Props {
  user: {
    id: number
    name: string
    email: string
    phone?: string | null
    department?: string | null
    role: string
  }
}

const ROLE_LABELS: Record<string, string> = {
  director: '디렉터',
  pm: 'PM',
  engineer: '엔지니어',
  viewer: '열람자',
}

export function ProfileForm({ user }: Props) {
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [department, setDepartment] = useState(user.department ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('이름을 입력해 주세요')
      return
    }

    setSaving(true)
    const data: UpdateProfileData = {
      name,
      phone: phone || undefined,
      department: department || undefined,
    }
    const result = await updateProfile(data)
    setSaving(false)

    if ('ok' in result) {
      toast.success('프로필이 수정되었습니다')
    } else {
      toast.error(result.error ?? '수정에 실패했습니다')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">내 프로필</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">이메일</label>
              <TextInput value={user.email} disabled />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">역할</label>
              <TextInput value={ROLE_LABELS[user.role] || user.role} disabled />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">이름</label>
            <TextInput value={name} onValueChange={setName} placeholder="이름" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">전화번호</label>
              <TextInput value={phone} onValueChange={setPhone} placeholder="전화번호" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">소속부서</label>
              <Select value={department} onValueChange={setDepartment} placeholder="선택">
                {Object.entries(DEPARTMENT_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" loading={saving}>
              저장
            </Button>
          </div>
        </form>
      </Card>

      <Text className="text-xs text-gray-400">이메일과 역할 변경은 관리자에게 문의하세요.</Text>
    </div>
  )
}
