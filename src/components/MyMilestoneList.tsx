'use client'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Badge, Button, Card, Text } from '@tremor/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { advanceMilestone, reorderMilestones } from '@/app/(frontend)/my-projects/actions'
import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  PROJECT_STATUS_LABELS,
  CATEGORY_LABELS,
} from '@/lib/constants'
import { fmtNum } from '@/lib/format'
import type { MyProjectMilestone } from '@/lib/types'

const ACTION_LABEL: Record<string, string> = {
  pending: '착수',
  active: '완료 처리',
}

interface ProjectGroup {
  projectId: number
  projectName: string
  projectCode: string
  projectType: string
  projectStatus: string
  milestones: MyProjectMilestone[]
}

function groupByProject(milestones: MyProjectMilestone[]): ProjectGroup[] {
  const map = new Map<number, ProjectGroup>()
  for (const m of milestones) {
    let group = map.get(m.project_id)
    if (!group) {
      group = {
        projectId: m.project_id,
        projectName: m.project_name,
        projectCode: m.project_code,
        projectType: m.project_type,
        projectStatus: m.project_status,
        milestones: [],
      }
      map.set(m.project_id, group)
    }
    group.milestones.push(m)
  }
  return Array.from(map.values())
}

function SortableMilestoneRow({ m }: { m: MyProjectMilestone }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const canAdvance = m.milestone_status === 'pending' || m.milestone_status === 'active'
  const overdue = Number(m.days_overdue) || 0

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: m.milestone_id })

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function handleAdvance() {
    startTransition(async () => {
      const result = await advanceMilestone(m.milestone_id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.milestoneName} → ${result.newStatus === 'done' ? '완료' : '진행중'}`)
      router.refresh()
    })
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className="flex items-center justify-between border-b border-stone-100 py-2 last:border-0"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="cursor-grab touch-none text-stone-300 hover:text-stone-500"
            aria-label="드래그하여 순서 변경"
            {...listeners}
          >
            ⠿
          </button>
          <span className="text-sm font-medium">{m.milestone_name}</span>
          <Badge color={MILESTONE_STATUS_COLORS[m.milestone_status] || 'gray'} size="xs">
            {MILESTONE_STATUS_LABELS[m.milestone_status] || m.milestone_status}
          </Badge>
          {m.category && (
            <Badge color="gray" size="xs">
              {CATEGORY_LABELS[m.category] || m.category}
            </Badge>
          )}
          {overdue > 0 && (
            <Badge color="red" size="xs">
              {fmtNum(overdue)}일 지연
            </Badge>
          )}
          {m.due_date && <Text className="text-xs text-stone-400">마감: {m.due_date}</Text>}
        </div>
        {canAdvance && (
          <Button
            size="xs"
            variant="secondary"
            color={m.milestone_status === 'active' ? 'green' : 'gray'}
            onClick={handleAdvance}
            loading={isPending}
            disabled={isPending}
          >
            {ACTION_LABEL[m.milestone_status]}
          </Button>
        )}
      </div>
    </div>
  )
}

function ProjectGroupCard({ group }: { group: ProjectGroup }) {
  const [milestones, setMilestones] = useState(group.milestones)
  const done = milestones.filter((m) => m.milestone_status === 'done').length
  const total = milestones.length

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = milestones.findIndex((m) => m.milestone_id === active.id)
    const newIndex = milestones.findIndex((m) => m.milestone_id === over.id)
    const reordered = arrayMove(milestones, oldIndex, newIndex)
    setMilestones(reordered)

    reorderMilestones(reordered.map((m) => m.milestone_id)).then((result) => {
      if ('error' in result) {
        toast.error(result.error)
        setMilestones(milestones)
      } else {
        toast.success('순서가 변경되었습니다')
      }
    })
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${group.projectId}`}
            className="text-base font-semibold hover:underline"
          >
            {group.projectName}
          </Link>
          <Badge color={PROJECT_TYPE_COLORS[group.projectType] || 'gray'} size="xs">
            {PROJECT_TYPE_LABELS[group.projectType] || group.projectType}
          </Badge>
          <Badge color="gray" size="xs">
            {PROJECT_STATUS_LABELS[group.projectStatus] || group.projectStatus}
          </Badge>
          {group.projectCode && (
            <Text className="text-xs text-stone-400">{group.projectCode}</Text>
          )}
        </div>
        <Text className="text-sm text-stone-500">
          {done}/{total} 완료
        </Text>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={milestones.map((m) => m.milestone_id)}
          strategy={verticalListSortingStrategy}
        >
          {milestones.map((m) => (
            <SortableMilestoneRow key={m.milestone_id} m={m} />
          ))}
        </SortableContext>
      </DndContext>
    </Card>
  )
}

export function MyMilestoneList({ milestones }: { milestones: MyProjectMilestone[] }) {
  const groups = groupByProject(milestones)

  if (groups.length === 0) {
    return <p className="py-12 text-center text-stone-500">현재 배치된 프로젝트가 없습니다.</p>
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <ProjectGroupCard key={g.projectId} group={g} />
      ))}
    </div>
  )
}
