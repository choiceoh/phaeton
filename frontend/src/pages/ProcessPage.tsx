import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
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
import { useCollection } from '@/hooks/useCollections'
import { useProcess, useSaveProcess } from '@/hooks/useProcess'
import { formatError } from '@/lib/api'

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
}

export default function ProcessPage() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const { data: collection, isLoading: colLoading } = useCollection(appId)
  const { data: process, isLoading: procLoading, isError, error, refetch } = useProcess(appId)
  const saveProcess = useSaveProcess(appId ?? '')

  const [isEnabled, setIsEnabled] = useState(false)
  const [statuses, setStatuses] = useState<StatusDraft[]>([])
  const [transitions, setTransitions] = useState<TransitionDraft[]>([])
  const [newStatusName, setNewStatusName] = useState('')

  // Sync server state to local state.
  useEffect(() => {
    if (!process) return
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
      // Rebuild transitions from server data using status ID → index mapping.
      if (process.transitions?.length) {
        const idToIndex = new Map(process.statuses.map((s, i) => [s.id, i]))
        setTransitions(
          process.transitions
            .filter((t) => idToIndex.has(t.from_status_id) && idToIndex.has(t.to_status_id))
            .map((t) => ({
              from_index: idToIndex.get(t.from_status_id)!,
              to_index: idToIndex.get(t.to_status_id)!,
              label: t.label,
            })),
        )
      } else {
        setTransitions([])
      }
    } else {
      setStatuses([])
      setTransitions([])
    }
  }, [process])

  if (colLoading || procLoading) return <LoadingState />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!collection) return null

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
    // If removed was initial, set first remaining as initial.
    if (removed.is_initial && next.length > 0) {
      next[0] = { ...next[0], is_initial: true }
    }
    // Fix sort_order.
    const reordered = next.map((s, i) => ({ ...s, sort_order: i }))
    setStatuses(reordered)
    // Remove transitions referencing the removed index and adjust indices.
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

  function addTransition() {
    if (statuses.length < 2) return
    setTransitions([
      ...transitions,
      { from_index: 0, to_index: 1, label: '' },
    ])
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
    <div>
      <PageHeader
        title={`${collection.label} > 프로세스 관리`}
        actions={
          <Link to={`/apps/${collection.id}/settings`}>
            <Button variant="outline">관리 홈으로 이동</Button>
          </Link>
        }
      />

      <div className="space-y-6">
        {/* Toggle */}
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={!isEnabled}
            onCheckedChange={(c) => setIsEnabled(!c)}
          />
          이 앱에서는 상태를 사용하지 않겠습니다.
        </label>

        {isEnabled && (
          <>
            {/* Add status */}
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
                <Button onClick={addStatus}>+</Button>
              </div>
            </section>

            {/* Status list */}
            {statuses.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold">상태 ({statuses.length})</h2>
                <div className="space-y-2">
                  {statuses.map((s, idx) => (
                    <Card key={idx} className="flex items-center gap-3 p-3">
                      <div
                        className="h-4 w-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="flex-1 font-medium">{s.name}</span>
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

            {/* Transitions */}
            {statuses.length >= 2 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">전이 ({transitions.length})</h2>
                  <Button size="sm" onClick={addTransition}>
                    + 전이 추가
                  </Button>
                </div>
                <div className="space-y-2">
                  {transitions.map((t, idx) => (
                    <Card key={idx} className="flex items-center gap-2 p-3">
                      <Select
                        value={String(t.from_index)}
                        onValueChange={(v) => updateTransition(idx, { from_index: Number(v) })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map((s, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={String(t.to_index)}
                        onValueChange={(v) => updateTransition(idx, { to_index: Number(v) })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map((s, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex-1">
                        <Label className="sr-only">라벨</Label>
                        <Input
                          placeholder="전이 라벨 (예: 진행하기)"
                          value={t.label}
                          onChange={(e) => updateTransition(idx, { label: e.target.value })}
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeTransition(idx)}>
                        삭제
                      </Button>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Flow diagram */}
            {statuses.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold">플로우</h2>
                <ProcessFlowDiagram statuses={statuses} transitions={transitions} />
              </section>
            )}
          </>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 border-t pt-4">
          <Button onClick={handleSave} disabled={saveProcess.isPending}>
            {saveProcess.isPending ? '저장 중...' : '저장'}
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            취소
          </Button>
          <Link to={`/apps/${collection.id}/settings`}>
            <Button variant="outline">관리 홈으로 이동</Button>
          </Link>
          <Button variant="outline" onClick={() => navigate(`/apps/${collection.id}`)}>
            해당 앱으로 이동
          </Button>
        </div>
      </div>
    </div>
  )
}

// --- Flow Diagram Component ---

function ProcessFlowDiagram({
  statuses,
  transitions,
}: {
  statuses: StatusDraft[]
  transitions: TransitionDraft[]
}) {
  // Build forward transition labels (from → to) for display between nodes.
  const forwardLabels = new Map<string, string>()
  const backwardTransitions: TransitionDraft[] = []

  for (const t of transitions) {
    if (t.from_index < t.to_index) {
      forwardLabels.set(`${t.from_index}-${t.to_index}`, t.label)
    } else {
      backwardTransitions.push(t)
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white p-6">
      {/* Backward transitions (shown as curved arrows above) */}
      {backwardTransitions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {backwardTransitions.map((t, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {statuses[t.to_index]?.name} ← {statuses[t.from_index]?.name}
              {t.label && ` (${t.label})`}
            </Badge>
          ))}
        </div>
      )}

      {/* Main flow */}
      <div className="flex items-center gap-0">
        {/* START node */}
        <div className="flex items-center gap-2">
          <div className="rounded-full border-2 border-gray-800 px-4 py-2 text-sm font-bold">
            START
          </div>
          <Arrow />
        </div>

        {statuses.map((s, idx) => {
          // Find forward transition label to next node.
          const nextLabel = forwardLabels.get(`${idx}-${idx + 1}`)
          const isLast = idx === statuses.length - 1

          return (
            <div key={idx} className="flex items-center gap-0">
              <div
                className="rounded px-4 py-2 text-sm font-medium text-white min-w-[80px] text-center"
                style={{ backgroundColor: s.color }}
              >
                {s.name}
              </div>
              {!isLast && (
                <div className="flex flex-col items-center">
                  {nextLabel && (
                    <span className="mb-1 text-xs text-muted-foreground whitespace-nowrap">
                      {nextLabel}
                    </span>
                  )}
                  <Arrow />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex items-center px-1">
      <div className="h-px w-8 bg-gray-400" />
      <div className="border-4 border-transparent border-l-gray-400" />
    </div>
  )
}
