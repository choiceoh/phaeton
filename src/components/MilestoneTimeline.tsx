import { Badge } from '@tremor/react'

import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_COLORS,
  CATEGORY_LABELS,
} from '@/lib/constants'

interface MilestoneItem {
  id: number | string
  name: string
  status: string
  plannedDate?: string | null
  actualDate?: string | null
  dueDate?: string | null
  seqOrder: number
  assignee?: { name: string } | number | null
  template?: { category: string } | number | null
}

const NODE_BG: Record<string, string> = {
  done: 'bg-green-500',
  active: 'bg-blue-500',
  pending: 'bg-gray-300',
  blocked: 'bg-amber-500',
  skipped: 'bg-gray-300',
}

function getDaysOverdue(
  dueDate: string | null | undefined,
  status: string,
): number | null {
  if (!dueDate || !['pending', 'active'].includes(status)) return null
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor(
    (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
  )
  return diff > 0 ? diff : null
}

export function MilestoneTimeline({
  milestones,
}: {
  milestones: MilestoneItem[]
}) {
  if (milestones.length === 0) {
    return (
      <p className="text-sm text-gray-400">마일스톤이 없습니다.</p>
    )
  }

  return (
    <div>
      {milestones.map((m, i) => {
        const overdue = getDaysOverdue(m.dueDate, m.status)
        const isLast = i === milestones.length - 1
        const category =
          m.template && typeof m.template === 'object'
            ? m.template.category
            : null
        const assigneeName =
          m.assignee && typeof m.assignee === 'object'
            ? m.assignee.name
            : null

        return (
          <div key={m.id} className="flex">
            <div className="flex flex-col items-center mr-4">
              <div
                className={`w-3 h-3 rounded-full shrink-0 mt-1
                  ${NODE_BG[m.status] || 'bg-gray-300'}`}
              />
              {!isLast && (
                <div className="w-0.5 bg-gray-200 flex-1 min-h-[2.5rem]" />
              )}
            </div>
            <div className="pb-5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{m.name}</span>
                <Badge
                  color={MILESTONE_STATUS_COLORS[m.status] || 'gray'}
                >
                  {MILESTONE_STATUS_LABELS[m.status] || m.status}
                </Badge>
                {category && (
                  <Badge color="gray">
                    {CATEGORY_LABELS[category] || category}
                  </Badge>
                )}
                {overdue && (
                  <Badge color="red">{overdue}일 지연</Badge>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1 space-x-3">
                {m.plannedDate && <span>계획: {m.plannedDate}</span>}
                {m.actualDate && <span>실제: {m.actualDate}</span>}
                {m.dueDate && <span>마감: {m.dueDate}</span>}
                {assigneeName && <span>담당: {assigneeName}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
