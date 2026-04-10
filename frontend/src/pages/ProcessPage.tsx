import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
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
  allowed_roles: string[]
}

const ALL_ROLES = [
  { value: 'director', label: '관리자' },
  { value: 'pm', label: '운영자' },
  { value: 'engineer', label: '담당자' },
  { value: 'viewer', label: '열람자' },
] as const

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
              allowed_roles: t.allowed_roles ?? [],
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
      { from_index: 0, to_index: 1, label: '', allowed_roles: [] },
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
        breadcrumb={[
          { label: '업무 목록', href: '/apps' },
          { label: collection.label, href: `/apps/${collection.id}` },
          { label: '설정', href: `/apps/${collection.id}/settings` },
          { label: '프로세스' },
        ]}
        title="프로세스 관리"
      />

      <div className="space-y-6">
        {/* Toggle */}
        <label className="flex items-center gap-2 text-sm">
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
                    <Card key={idx} className="flex items-center gap-2 p-3">
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
                  <h2 className="text-sm font-semibold">상태 이동 ({transitions.length})</h2>
                  <Button size="sm" onClick={addTransition}>
                    + 상태 이동 추가
                  </Button>
                </div>
                <div className="space-y-2">
                  {transitions.map((t, idx) => (
                    <Card key={idx} className="space-y-2 p-3">
                      <div className="flex items-center gap-2">
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
                            placeholder="이동 이름 (예: 진행하기)"
                            value={t.label}
                            onChange={(e) => updateTransition(idx, { label: e.target.value })}
                          />
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeTransition(idx)}>
                          삭제
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">허용 역할:</span>
                        {ALL_ROLES.map((role) => (
                          <label key={role.value} className="flex items-center gap-1 text-xs">
                            <Checkbox
                              checked={t.allowed_roles.includes(role.value)}
                              onCheckedChange={(checked) => {
                                const next = checked
                                  ? [...t.allowed_roles, role.value]
                                  : t.allowed_roles.filter((r) => r !== role.value)
                                updateTransition(idx, { allowed_roles: next })
                              }}
                            />
                            {role.label}
                          </label>
                        ))}
                        {t.allowed_roles.length === 0 && (
                          <span className="text-xs text-muted-foreground">(비어있으면 전체 허용)</span>
                        )}
                      </div>
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
        <div className="flex items-center gap-2 border-t pt-4">
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

// --- SVG Flow Diagram Component ---

const ROLE_LABELS: Record<string, string> = {
  director: '관리자',
  pm: '운영자',
  engineer: '담당자',
  viewer: '열람자',
}

const NODE_W = 100
const NODE_H = 36
const NODE_RX = 6
const GAP_X = 140
const START_R = 18
const PADDING = 40
const ARROW_SIZE = 6

function ProcessFlowDiagram({
  statuses,
  transitions,
}: {
  statuses: StatusDraft[]
  transitions: TransitionDraft[]
}) {
  if (statuses.length === 0) return null

  // Layout: START circle on the left, then status nodes spaced horizontally.
  // Y center line; backward arcs curve above, skip-forward arcs curve below.
  const startX = PADDING + START_R
  const nodesStartX = startX + START_R + GAP_X
  const centerY = PADDING + 60 // leave room for backward arcs above

  // Compute node positions.
  const nodePositions = statuses.map((_, i) => ({
    x: nodesStartX + i * (NODE_W + GAP_X),
    y: centerY,
  }))

  const svgW = (nodePositions[nodePositions.length - 1]?.x ?? 0) + NODE_W + PADDING
  const svgH = centerY + 80 + PADDING // room for below-arcs

  // Classify transitions.
  const forwardAdj: TransitionDraft[] = [] // from_index + 1 === to_index
  const forwardSkip: TransitionDraft[] = [] // from < to, skip > 1
  const backward: TransitionDraft[] = [] // from >= to
  const selfLoop: TransitionDraft[] = []

  for (const t of transitions) {
    if (t.from_index === t.to_index) selfLoop.push(t)
    else if (t.from_index < t.to_index) {
      if (t.to_index - t.from_index === 1) forwardAdj.push(t)
      else forwardSkip.push(t)
    } else {
      backward.push(t)
    }
  }

  function arrowHead(ex: number, ey: number, angle: number) {
    const a1 = angle + Math.PI * 0.8
    const a2 = angle - Math.PI * 0.8
    const p1x = ex + ARROW_SIZE * Math.cos(a1)
    const p1y = ey + ARROW_SIZE * Math.sin(a1)
    const p2x = ex + ARROW_SIZE * Math.cos(a2)
    const p2y = ey + ARROW_SIZE * Math.sin(a2)
    return `M${p1x},${p1y} L${ex},${ey} L${p2x},${p2y}`
  }

  function roleText(roles: string[]) {
    if (roles.length === 0) return ''
    return roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <svg width={svgW} height={svgH} className="block">
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M1,1 L7,4 L1,7" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
          </marker>
        </defs>

        {/* START → first status */}
        <circle cx={startX} cy={centerY + NODE_H / 2} r={START_R} fill="none" stroke="#1f2937" strokeWidth="2" />
        <text x={startX} y={centerY + NODE_H / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1f2937">
          START
        </text>
        {nodePositions.length > 0 && (
          <line
            x1={startX + START_R} y1={centerY + NODE_H / 2}
            x2={nodePositions[0].x - 2} y2={centerY + NODE_H / 2}
            stroke="#9ca3af" strokeWidth="1.5" markerEnd="url(#ah)"
          />
        )}

        {/* Status nodes */}
        {statuses.map((s, i) => {
          const { x, y } = nodePositions[i]
          return (
            <g key={i}>
              <rect
                x={x} y={y}
                width={NODE_W} height={NODE_H}
                rx={NODE_RX}
                fill={s.color}
              />
              <text
                x={x + NODE_W / 2} y={y + NODE_H / 2 + 4}
                textAnchor="middle" fontSize="12" fontWeight="500" fill="white"
              >
                {s.name}
              </text>
              {s.is_initial && (
                <text x={x + NODE_W / 2} y={y + NODE_H + 14} textAnchor="middle" fontSize="9" fill="#6b7280">
                  초기
                </text>
              )}
            </g>
          )
        })}

        {/* Forward adjacent transitions (straight arrows) */}
        {forwardAdj.map((t, i) => {
          const from = nodePositions[t.from_index]
          const to = nodePositions[t.to_index]
          const x1 = from.x + NODE_W
          const x2 = to.x
          const y = centerY + NODE_H / 2
          const midX = (x1 + x2) / 2
          return (
            <g key={`fa-${i}`}>
              <line x1={x1} y1={y} x2={x2 - 2} y2={y} stroke="#9ca3af" strokeWidth="1.5" markerEnd="url(#ah)" />
              {t.label && (
                <text x={midX} y={y - 8} textAnchor="middle" fontSize="10" fill="#374151">
                  {t.label}
                </text>
              )}
              {t.allowed_roles.length > 0 && (
                <text x={midX} y={y - 20} textAnchor="middle" fontSize="9" fill="#9ca3af">
                  {roleText(t.allowed_roles)}
                </text>
              )}
            </g>
          )
        })}

        {/* Forward skip transitions (arcs below) */}
        {forwardSkip.map((t, i) => {
          const from = nodePositions[t.from_index]
          const to = nodePositions[t.to_index]
          const x1 = from.x + NODE_W / 2
          const x2 = to.x + NODE_W / 2
          const y = centerY + NODE_H
          const span = t.to_index - t.from_index
          const curveY = y + 20 + span * 14
          const midX = (x1 + x2) / 2
          const path = `M${x1},${y} C${x1},${curveY} ${x2},${curveY} ${x2},${y}`
          const angle = -Math.PI / 2
          return (
            <g key={`fs-${i}`}>
              <path d={path} fill="none" stroke="#9ca3af" strokeWidth="1.2" strokeDasharray="4,3" />
              <path d={arrowHead(x2, y, angle)} fill="none" stroke="#9ca3af" strokeWidth="1.2" />
              {t.label && (
                <text x={midX} y={curveY + 12} textAnchor="middle" fontSize="9" fill="#6b7280">
                  {t.label}
                </text>
              )}
              {t.allowed_roles.length > 0 && (
                <text x={midX} y={curveY + 23} textAnchor="middle" fontSize="8" fill="#9ca3af">
                  {roleText(t.allowed_roles)}
                </text>
              )}
            </g>
          )
        })}

        {/* Backward transitions (arcs above) */}
        {backward.map((t, i) => {
          const from = nodePositions[t.from_index]
          const to = nodePositions[t.to_index]
          const x1 = from.x + NODE_W / 2
          const x2 = to.x + NODE_W / 2
          const y = centerY
          const span = t.from_index - t.to_index
          const curveY = y - 20 - span * 14 - i * 8
          const midX = (x1 + x2) / 2
          const path = `M${x1},${y} C${x1},${curveY} ${x2},${curveY} ${x2},${y}`
          const angle = Math.PI / 2
          return (
            <g key={`bw-${i}`}>
              <path d={path} fill="none" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4,3" />
              <path d={arrowHead(x2, y, angle)} fill="none" stroke="#ef4444" strokeWidth="1.2" />
              {t.label && (
                <text x={midX} y={curveY - 4} textAnchor="middle" fontSize="9" fill="#ef4444">
                  {t.label}
                </text>
              )}
              {t.allowed_roles.length > 0 && (
                <text x={midX} y={curveY - 15} textAnchor="middle" fontSize="8" fill="#9ca3af">
                  {roleText(t.allowed_roles)}
                </text>
              )}
            </g>
          )
        })}

        {/* Self-loop transitions */}
        {selfLoop.map((t, i) => {
          const node = nodePositions[t.from_index]
          const cx = node.x + NODE_W / 2
          const topY = node.y - 4
          const r = 14
          return (
            <g key={`sl-${i}`}>
              <path
                d={`M${cx - 8},${topY} A${r},${r} 0 1,1 ${cx + 8},${topY}`}
                fill="none" stroke="#9ca3af" strokeWidth="1.2"
              />
              <path d={arrowHead(cx + 8, topY, Math.PI / 3)} fill="none" stroke="#9ca3af" strokeWidth="1.2" />
              {t.label && (
                <text x={cx} y={topY - r - 6} textAnchor="middle" fontSize="9" fill="#6b7280">
                  {t.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
