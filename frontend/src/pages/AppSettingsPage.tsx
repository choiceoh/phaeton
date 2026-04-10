import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import RoleGate from '@/components/common/RoleGate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useAddField,
  useCollection,
  useDeleteCollection,
  useDeleteField,
} from '@/hooks/useCollections'
import { useMembers, useAddMember, useRemoveMember } from '@/hooks/useMembers'
import { formatError } from '@/lib/api'
import { FIELD_TYPE_LABELS } from '@/lib/constants'
import type { CreateFieldIn, FieldType } from '@/lib/types'

const FIELD_TYPES: FieldType[] = [
  'text', 'number', 'integer', 'boolean', 'date', 'datetime',
  'select', 'multiselect', 'relation', 'file', 'json',
]

export default function AppSettingsPage() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const { data: collection, isLoading, isError, error, refetch } = useCollection(appId)

  const addField = useAddField(appId ?? '')
  const deleteField = useDeleteField()
  const deleteCollection = useDeleteCollection()
  const { data: members } = useMembers(appId)
  const addMember = useAddMember(appId ?? '')
  const removeMember = useRemoveMember(appId ?? '')

  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('viewer')
  const [newFieldOpen, setNewFieldOpen] = useState(false)
  const [newField, setNewField] = useState<Partial<CreateFieldIn>>({
    field_type: 'text',
    is_required: false,
    is_unique: false,
    is_indexed: false,
  })

  const [confirmDeleteField, setConfirmDeleteField] = useState<string | null>(null)
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState(false)

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!collection) return null

  function handleAddField() {
    if (!newField.slug || !newField.label || !newField.field_type) {
      toast.error('slug, label, 타입은 필수입니다')
      return
    }
    const input: CreateFieldIn = {
      slug: newField.slug,
      label: newField.label,
      field_type: newField.field_type,
      is_required: newField.is_required ?? false,
      is_unique: newField.is_unique ?? false,
      is_indexed: newField.is_indexed ?? false,
    }
    // Two-phase: first try without confirm, server returns preview if dangerous.
    addField.mutate(
      { input, confirm: false },
      {
        onSuccess: (data) => {
          if (typeof data === 'object' && data && 'confirmation_required' in data) {
            // Re-submit with confirm flag
            addField.mutate(
              { input, confirm: true },
              {
                onSuccess: () => {
                  toast.success('필드가 추가되었습니다')
                  setNewFieldOpen(false)
                  setNewField({ field_type: 'text', is_required: false, is_unique: false, is_indexed: false })
                },
                onError: (err) => toast.error(formatError(err)),
              },
            )
          } else {
            toast.success('필드가 추가되었습니다')
            setNewFieldOpen(false)
            setNewField({ field_type: 'text', is_required: false, is_unique: false, is_indexed: false })
          }
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  function handleDeleteField() {
    if (!confirmDeleteField) return
    deleteField.mutate(
      { fieldId: confirmDeleteField, confirm: true },
      {
        onSuccess: () => {
          toast.success('필드가 삭제되었습니다')
          setConfirmDeleteField(null)
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  function handleDeleteCollection() {
    deleteCollection.mutate(
      { id: collection!.id, confirm: true },
      {
        onSuccess: () => {
          toast.success('컬렉션이 삭제되었습니다')
          navigate('/apps')
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  return (
    <div>
      <PageHeader
        title={`${collection.label} 설정`}
        description={`/${collection.slug} 컬렉션의 필드 및 메타데이터`}
        actions={
          <Button variant="outline" onClick={() => navigate(`/apps/${collection.id}`)}>
            돌아가기
          </Button>
        }
      />

      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">필드 ({collection.fields?.length ?? 0})</h2>
            <RoleGate roles={['director', 'pm']}>
              <Button size="sm" onClick={() => setNewFieldOpen(!newFieldOpen)}>
                {newFieldOpen ? '취소' : '+ 필드 추가'}
              </Button>
            </RoleGate>
          </div>

          {newFieldOpen && (
            <Card className="mb-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>슬러그 (영문)</Label>
                  <Input
                    value={newField.slug ?? ''}
                    onChange={(e) =>
                      setNewField({
                        ...newField,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>라벨</Label>
                  <Input
                    value={newField.label ?? ''}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  />
                </div>
                <div>
                  <Label>타입</Label>
                  <Select
                    value={newField.field_type}
                    onValueChange={(v) =>
                      v && setNewField({ ...newField, field_type: v as FieldType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {FIELD_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 pt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newField.is_required}
                      onCheckedChange={(c) =>
                        setNewField({ ...newField, is_required: !!c })
                      }
                    />
                    필수
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newField.is_unique}
                      onCheckedChange={(c) => setNewField({ ...newField, is_unique: !!c })}
                    />
                    고유
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newField.is_indexed}
                      onCheckedChange={(c) =>
                        setNewField({ ...newField, is_indexed: !!c })
                      }
                    />
                    인덱스
                  </label>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={handleAddField} disabled={addField.isPending}>
                  {addField.isPending ? '추가 중...' : '필드 추가'}
                </Button>
              </div>
            </Card>
          )}

          <div className="space-y-2">
            {collection.fields?.map((f) => (
              <Card key={f.id} className="flex items-center justify-between p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.label}</span>
                  <Badge variant="secondary">{FIELD_TYPE_LABELS[f.field_type]}</Badge>
                  <span className="text-xs text-muted-foreground">{f.slug}</span>
                  {f.is_required && <Badge variant="outline">필수</Badge>}
                  {f.is_unique && <Badge variant="outline">고유</Badge>}
                  {f.is_indexed && <Badge variant="outline">인덱스</Badge>}
                </div>
                <RoleGate roles={['director']}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDeleteField(f.id)}
                  >
                    삭제
                  </Button>
                </RoleGate>
              </Card>
            ))}
          </div>
        </section>

        <RoleGate roles={['director', 'pm']}>
          <section>
            <h2 className="text-lg font-semibold">프로세스</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              항목의 상태 흐름(워크플로우)을 정의합니다.
            </p>
            <Link to={`/apps/${collection.id}/process`}>
              <Button variant="outline" size="sm" className="mt-2">
                프로세스 설정
              </Button>
            </Link>
          </section>
        </RoleGate>

        <RoleGate roles={['director', 'pm']}>
          <section>
            <h2 className="text-lg font-semibold">자동화</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              레코드 생성/수정/삭제 시 자동으로 알림 발송, 필드 업데이트, Webhook 호출을 실행합니다.
            </p>
            <Link to={`/apps/${collection.id}/automations`}>
              <Button variant="outline" size="sm" className="mt-2">
                자동화 설정
              </Button>
            </Link>
          </section>
        </RoleGate>

        <RoleGate roles={['director']}>
          <section>
            <h2 className="mb-3 text-lg font-semibold">멤버 ({members?.length ?? 0})</h2>
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
            <Card className="mt-3 p-4">
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
          </section>
        </RoleGate>

        <RoleGate roles={['director']}>
          <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <h2 className="text-base font-semibold text-destructive">위험 영역</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              컬렉션을 삭제하면 모든 항목과 마이그레이션 이력이 제거됩니다. 롤백 전에는
              데이터가 영구히 사라집니다.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-3"
              onClick={() => setConfirmDeleteCollection(true)}
            >
              컬렉션 삭제
            </Button>
          </section>
        </RoleGate>
      </div>

      <ConfirmDialog
        open={!!confirmDeleteField}
        onOpenChange={(open) => !open && setConfirmDeleteField(null)}
        title="필드를 삭제하시겠습니까?"
        description="기존 데이터의 해당 컬럼이 영구히 사라집니다."
        variant="destructive"
        confirmLabel="삭제"
        onConfirm={handleDeleteField}
        loading={deleteField.isPending}
      />

      <ConfirmDialog
        open={confirmDeleteCollection}
        onOpenChange={setConfirmDeleteCollection}
        title="컬렉션을 삭제하시겠습니까?"
        description={`"${collection.label}" 컬렉션과 모든 데이터가 영구 삭제됩니다.`}
        variant="destructive"
        confirmLabel="삭제"
        onConfirm={handleDeleteCollection}
        loading={deleteCollection.isPending}
      />
    </div>
  )
}
