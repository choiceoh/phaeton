import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import IconPicker from '@/components/works/IconPicker'
import ProcessFlowDiagram from '@/components/works/ProcessFlowDiagram'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useDeleteCollection,
  useUpdateCollection,
} from '@/hooks/useCollections'
import { useMembers, useAddMember, useRemoveMember } from '@/hooks/useMembers'
import { useProcess, useSaveProcess } from '@/hooks/useProcess'
import { useUsers } from '@/hooks/useUsers'
import { formatError } from '@/lib/api'
import type { Collection, RLSFilter } from '@/lib/types'

const STATUS_COLORS = [
  { label: '회색', value: '#6b7280' },
  { label: '파랑', value: '#3b82f6' },
  { label: '초록', value: '#22c55e' },
  { label: '노랑', value: '#eab308' },
  { label: '주황', value: '#f97316' },
  { label: '빨강', value: '#ef4444' },
  { label: '보라', value: '#a855f7' },
  { label: '청록', value: '#06b6d4' },
]

interface StatusDraft {
  name: string
  color: string
  sort_order: number
  is_initial: boolean
}

interface TransitionDraft {
  from_index: number
  to_index: number
  label: string
  allowed_roles: string[]
  allowed_user_ids: string[]
}

interface SettingsPanelProps {
  collection: Collection
  onDelete?: () => void
}

export default function SettingsPanel({ collection, onDelete }: SettingsPanelProps) {
  const updateCollection = useUpdateCollection(collection.id)
  const deleteCollection = useDeleteCollection()
  const { data: members } = useMembers(collection.id)
  const addMember = useAddMember(collection.id)
  const removeMember = useRemoveMember(collection.id)

  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('viewer')
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState(false)

  function handleDeleteCollection() {
    deleteCollection.mutate(
      { id: collection.id, confirm: true },
      {
        onSuccess: () => {
          toast.success('앱이 삭제되었습니다')
          onDelete?.()
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  return (
    <Tabs defaultValue="general" className="h-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="general">일반</TabsTrigger>
        <TabsTrigger value="members">멤버</TabsTrigger>
        <TabsTrigger value="access">열람 범위</TabsTrigger>
        <TabsTrigger value="process">프로세스</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-6 pt-4">
        <section>
          <h3 className="mb-3 text-sm font-semibold">기본 정보</h3>
          <div className="flex items-center gap-3">
            <div>
              <Label>아이콘</Label>
              <IconPicker
                value={collection.icon}
                onChange={(icon) =>
                  updateCollection.mutate(
                    { icon },
                    { onError: (err) => toast.error(formatError(err)) },
                  )
                }
              />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="text-base font-semibold text-destructive">위험 영역</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            앱을 삭제하면 모든 항목과 변경 이력이 제거됩니다.
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="mt-3"
            onClick={() => setConfirmDeleteCollection(true)}
          >
            앱 삭제
          </Button>
        </section>

        <ConfirmDialog
          open={confirmDeleteCollection}
          onOpenChange={setConfirmDeleteCollection}
          title="앱을 삭제하시겠습니까?"
          description={`"${collection.label}" 앱과 모든 데이터가 영구 삭제됩니다.`}
          variant="destructive"
          confirmLabel="삭제"
          onConfirm={handleDeleteCollection}
          loading={deleteCollection.isPending}
        />
      </TabsContent>

      <TabsContent value="members" className="space-y-4 pt-4">
        <h3 className="text-sm font-semibold">멤버 ({members?.length ?? 0})</h3>
        <div className="space-y-2">
          {members?.map((m) => (
            <Card key={m.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.user_name || m.user_email}</span>
                <Badge variant="secondary">{m.role}</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  removeMember.mutate(m.user_id, {
                    onSuccess: () => toast.success('멤버가 제거되었습니다'),
                    onError: (err) => toast.error(formatError(err)),
                  })
                }}
              >
                제거
              </Button>
            </Card>
          ))}
        </div>
        <Card className="p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>사용자 ID</Label>
              <Input
                value={newMemberUserId}
                onChange={(e) => setNewMemberUserId(e.target.value)}
                placeholder="UUID"
              />
            </div>
            <div>
              <Label>역할</Label>
              <Select value={newMemberRole} onValueChange={(v) => v && setNewMemberRole(v)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">소유자</SelectItem>
                  <SelectItem value="editor">편집자</SelectItem>
                  <SelectItem value="viewer">열람자</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!newMemberUserId.trim() || addMember.isPending}
              onClick={() => {
                addMember.mutate(
                  { user_id: newMemberUserId.trim(), role: newMemberRole },
                  {
                    onSuccess: () => {
                      toast.success('멤버가 추가되었습니다')
                      setNewMemberUserId('')
                    },
                    onError: (err) => toast.error(formatError(err)),
                  },
                )
              }}
            >
              추가
            </Button>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="access" className="space-y-4 pt-4">
        <div>
          <h3 className="mb-1 text-sm font-semibold">데이터 열람 범위</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            열람자(viewer) 역할의 멤버가 볼 수 있는 데이터 범위를 제한합니다.
          </p>
          <Select
            value={collection.access_config?.rls_mode || 'none'}
            onValueChange={(v) => {
              const mode = v === 'none' ? '' : v
              updateCollection.mutate(
                {
                  access_config: {
                    ...collection.access_config,
                    rls_mode: mode as '' | 'none' | 'creator' | 'department' | 'subsidiary' | 'filter',
                  },
                },
                {
                  onSuccess: () => toast.success('열람 범위 설정이 저장되었습니다'),
                  onError: (err) => toast.error(formatError(err)),
                },
              )
            }}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">제한 없음 (모든 행 열람)</SelectItem>
              <SelectItem value="creator">본인 작성 행만 열람</SelectItem>
              <SelectItem value="department">같은 부서 행만 열람</SelectItem>
              <SelectItem value="subsidiary">같은 법인 행만 열람</SelectItem>
              <SelectItem value="filter">커스텀 필터 규칙</SelectItem>
            </SelectContent>
          </Select>

          {collection.access_config?.rls_mode === 'filter' && (
            <RLSFilterEditor
              filters={collection.access_config?.rls_filters ?? []}
              fields={(collection.fields ?? []).map((f) => ({ slug: f.slug, label: f.label }))}
              onSave={(filters) => {
                updateCollection.mutate(
                  {
                    access_config: {
                      ...collection.access_config,
                      rls_filters: filters,
                    },
                  },
                  {
                    onSuccess: () => toast.success('RLS 필터 규칙이 저장되었습니다'),
                    onError: (err) => toast.error(formatError(err)),
                  },
                )
              }}
            />
          )}
        </div>
      </TabsContent>

      <TabsContent value="process" className="pt-4">
        <ProcessSection collectionId={collection.id} />
      </TabsContent>
    </Tabs>
  )
}

// ── Process Section ──

function ProcessSection({ collectionId }: { collectionId: string }) {
  const { data: process, isLoading, refetch } = useProcess(collectionId)
  const saveProcess = useSaveProcess(collectionId)
  const { data: allUsers } = useUsers()

  const [isEnabled, setIsEnabled] = useState(false)
  const [statuses, setStatuses] = useState<StatusDraft[]>([])
  const [transitions, setTransitions] = useState<TransitionDraft[]>([])
  const [newStatusName, setNewStatusName] = useState('')

  const [syncedProcessId, setSyncedProcessId] = useState<string | null>(null)
  if (process && process.id !== syncedProcessId) {
    setSyncedProcessId(process.id)
    setIsEnabled(process.is_enabled)
    if (process.statuses?.length) {
      setStatuses(
        process.statuses.map((s) => ({
          name: s.name,
          color: s.color,
          sort_order: s.sort_order,
          is_initial: s.is_initial,
        })),
      )
      if (process.transitions?.length) {
        const idToIndex = new Map(process.statuses.map((s, i) => [s.id, i]))
        setTransitions(
          process.transitions
            .filter((t) => idToIndex.has(t.from_status_id) && idToIndex.has(t.to_status_id))
            .map((t) => ({
              from_index: idToIndex.get(t.from_status_id)!,
              to_index: idToIndex.get(t.to_status_id)!,
              label: t.label,
              allowed_roles: t.allowed_roles ?? [],
              allowed_user_ids: t.allowed_user_ids ?? [],
            })),
        )
      } else {
        setTransitions([])
      }
    } else {
      setStatuses([])
      setTransitions([])
    }
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">로딩 중...</div>

  function addStatus() {
    const name = newStatusName.trim()
    if (!name) return
    const isFirst = statuses.length === 0
    setStatuses([
      ...statuses,
      {
        name,
        color: STATUS_COLORS[statuses.length % STATUS_COLORS.length].value,
        sort_order: statuses.length,
        is_initial: isFirst,
      },
    ])
    setNewStatusName('')
  }

  function removeStatus(idx: number) {
    const removed = statuses[idx]
    const next = statuses.filter((_, i) => i !== idx)
    if (removed.is_initial && next.length > 0) {
      next[0] = { ...next[0], is_initial: true }
    }
    const reordered = next.map((s, i) => ({ ...s, sort_order: i }))
    setStatuses(reordered)
    setTransitions(
      transitions
        .filter((t) => t.from_index !== idx && t.to_index !== idx)
        .map((t) => ({
          ...t,
          from_index: t.from_index > idx ? t.from_index - 1 : t.from_index,
          to_index: t.to_index > idx ? t.to_index - 1 : t.to_index,
        })),
    )
  }

  function setInitial(idx: number) {
    setStatuses(statuses.map((s, i) => ({ ...s, is_initial: i === idx })))
  }

  function removeTransition(idx: number) {
    setTransitions(transitions.filter((_, i) => i !== idx))
  }

  function updateTransition(idx: number, patch: Partial<TransitionDraft>) {
    setTransitions(transitions.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }

  function handleSave() {
    saveProcess.mutate(
      { is_enabled: isEnabled, statuses, transitions },
      {
        onSuccess: () => toast.success('프로세스가 저장되었습니다'),
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saveProcess.isPending} size="sm">
          {saveProcess.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />저장 중...</> : '저장'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          초기화
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={!isEnabled}
          onCheckedChange={(c) => setIsEnabled(!c)}
        />
        이 앱에서는 상태를 사용하지 않겠습니다.
      </label>

      {isEnabled && (
        <>
          <section>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  placeholder="상태 이름 입력"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addStatus()}
                />
              </div>
              <Button onClick={addStatus} size="sm">+</Button>
            </div>
          </section>

          {statuses.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">상태 ({statuses.length})</h3>
              <div className="space-y-2">
                {statuses.map((s, idx) => (
                  <Card key={idx} className="flex items-center gap-2 p-3">
                    <div
                      className="h-4 w-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="flex-1 font-medium text-sm">{s.name}</span>
                    <Select
                      value={s.color}
                      onValueChange={(v) => {
                        if (v) setStatuses(statuses.map((st, i) => (i === idx ? { ...st, color: v } : st)))
                      }}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_COLORS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: c.value }}
                              />
                              {c.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        name="initial"
                        checked={s.is_initial}
                        onChange={() => setInitial(idx)}
                      />
                      초기
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStatus(idx)}
                    >
                      삭제
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {statuses.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold">
                플로우 다이어그램 ({transitions.length}개 전이)
              </h3>
              <ProcessFlowDiagram
                statuses={statuses}
                transitions={transitions}
                users={allUsers?.map((u) => ({ id: u.id, name: u.name })) ?? []}
                onAddTransition={(from, to) => {
                  const fromName = statuses[from]?.name ?? ''
                  const toName = statuses[to]?.name ?? ''
                  setTransitions([
                    ...transitions,
                    { from_index: from, to_index: to, label: `${fromName} → ${toName}`, allowed_roles: [], allowed_user_ids: [] },
                  ])
                }}
                onRemoveTransition={removeTransition}
                onUpdateTransition={updateTransition}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                노드를 드래그하여 위치를 조정하세요. &quot;전이 추가&quot; 버튼을 누른 뒤 출발 → 도착 노드를 클릭하면 전이가 생성됩니다.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ── RLS Filter Editor ──

const RLS_OPS = [
  { value: 'eq', label: '같음 (=)' },
  { value: 'neq', label: '다름 (!=)' },
  { value: 'in', label: '포함 (IN)' },
  { value: 'contains', label: '텍스트 포함' },
] as const

const RLS_USER_VARS = [
  { value: '$user.id', label: '현재 사용자 ID' },
  { value: '$user.department_id', label: '현재 사용자 부서' },
  { value: '$user.subsidiary_id', label: '현재 사용자 법인' },
  { value: '$user.email', label: '현재 사용자 이메일' },
]

function RLSFilterEditor({
  filters,
  fields,
  onSave,
}: {
  filters: RLSFilter[]
  fields: { slug: string; label: string }[]
  onSave: (filters: RLSFilter[]) => void
}) {
  const [draft, setDraft] = useState<RLSFilter[]>(filters.length > 0 ? filters : [{ field: '', op: 'eq', value: '' }])

  const addRule = () => setDraft((prev) => [...prev, { field: '', op: 'eq', value: '' }])
  const removeRule = (i: number) => setDraft((prev) => prev.filter((_, idx) => idx !== i))
  const updateRule = (i: number, patch: Partial<RLSFilter>) =>
    setDraft((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const canSave = draft.every((r) => r.field && r.op && r.value)

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        필터 규칙을 정의하면 열람자는 모든 조건을 만족하는 행만 볼 수 있습니다.
        값에 <code className="rounded bg-muted px-1 text-xs">$user.department_id</code> 등을 사용하면 현재 사용자 속성으로 자동 치환됩니다.
      </p>
      {draft.map((rule, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={rule.field || undefined} onValueChange={(v) => updateRule(i, { field: v ?? '' })}>
            <SelectTrigger className="w-40"><SelectValue placeholder="필드" /></SelectTrigger>
            <SelectContent>
              {fields.map((f) => (
                <SelectItem key={f.slug} value={f.slug}>{f.label}</SelectItem>
              ))}
              <SelectItem value="created_by">작성자 ID</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rule.op} onValueChange={(v) => updateRule(i, { op: (v ?? 'eq') as RLSFilter['op'] })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RLS_OPS.map((op) => (
                <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1">
            <Select
              value={rule.value.startsWith('$user.') ? rule.value : '__custom__'}
              onValueChange={(v) => {
                if (!v || v === '__custom__') updateRule(i, { value: '' })
                else updateRule(i, { value: v })
              }}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="값 선택" /></SelectTrigger>
              <SelectContent>
                {RLS_USER_VARS.map((uv) => (
                  <SelectItem key={uv.value} value={uv.value}>{uv.label}</SelectItem>
                ))}
                <SelectItem value="__custom__">직접 입력</SelectItem>
              </SelectContent>
            </Select>
            {!rule.value.startsWith('$user.') && (
              <Input
                className="mt-1"
                placeholder="직접 입력 값"
                value={rule.value}
                onChange={(e) => updateRule(i, { value: e.target.value })}
              />
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => removeRule(i)} disabled={draft.length <= 1}>
            &times;
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addRule}>+ 규칙 추가</Button>
        <Button size="sm" disabled={!canSave} onClick={() => onSave(draft.filter((r) => r.field && r.value))}>
          저장
        </Button>
      </div>
    </div>
  )
}
