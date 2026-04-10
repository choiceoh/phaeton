import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import OrgTree from '@/components/admin/OrgTree'
import { useDepartments } from '@/hooks/useDepartments'
import { useUsers } from '@/hooks/useUsers'
import { ROLE_LABELS } from '@/lib/constants'
import type { User } from '@/lib/types'
import { useState } from 'react'

export default function OrgChartPage() {
  const { data: departments, isLoading: dLoading } = useDepartments()
  const { data: users, isLoading: uLoading } = useUsers()
  const [selected, setSelected] = useState<User | null>(null)

  if (dLoading || uLoading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="조직도" description="부서 및 구성원 현황" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <OrgTree
            departments={departments ?? []}
            users={(users ?? []).filter((u) => u.is_active)}
            onSelectUser={setSelected}
            selectedUserId={selected?.id}
          />
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-6">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-lg font-bold text-stone-600">
                  {selected.name.charAt(0)}
                </div>
                <div>
                  <p className="text-lg font-semibold">{selected.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {ROLE_LABELS[selected.role] ?? selected.role}
                    {selected.position && ` / ${selected.position}`}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Info label="이메일" value={selected.email} />
                <Info label="전화번호" value={selected.phone} />
                <Info label="직책" value={selected.title} />
                <Info label="입사일" value={selected.joined_at ?? undefined} />
                <Info
                  label="부서"
                  value={
                    selected.department_id
                      ? departments?.find((d) => d.id === selected.department_id)?.name
                      : undefined
                  }
                />
              </div>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              좌측 트리에서 구성원을 선택하세요
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="font-medium">{value}</p>
    </div>
  )
}
