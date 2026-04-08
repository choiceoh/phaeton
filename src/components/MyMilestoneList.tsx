'use client'

import { Badge, Button, Card, Text } from '@tremor/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  PROJECT_STATUS_LABELS,
  CATEGORY_LABELS,
} from '@/lib/constants'
import type { MyProjectMilestone } from '@/lib/types'

import { advanceMilestone } from '@/app/(frontend)/my-projects/actions'

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

function MilestoneRow({ m }: { m: MyProjectMilestone }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const canAdvance = m.milestone_status === 'pending' || m.milestone_status === 'active'
  const overdue = Number(m.days_overdue) || 0

  function handleAdvance() {
    startTransition(async () => {
      const result = await advanceMilestone(m.milestone_id)
      if ('error' in result) {
        alert(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
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
          <Badge color="red" size="xs">{overdue}일 지연</Badge>
        )}
        {m.due_date && (
          <Text className="text-xs text-gray-400">마감: {m.due_date}</Text>
        )}
      </div>
      {canAdvance && (
        <Button
          size="xs"
          variant="secondary"
          color={m.milestone_status === 'active' ? 'green' : 'blue'}
          onClick={handleAdvance}
          loading={isPending}
          disabled={isPending}
        >
          {ACTION_LABEL[m.milestone_status]}
        </Button>
      )}
    </div>
  )
}

export function MyMilestoneList({
  milestones,
}: {
  milestones: MyProjectMilestone[]
}) {
  const groups = groupByProject(milestones)

  if (groups.length === 0) {
    return (
      <p className="text-center text-gray-500 py-12">
        현재 배치된 프로젝트가 없습니다.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(g => {
        const done = g.milestones.filter(m => m.milestone_status === 'done').length
        const total = g.milestones.length

        return (
          <Card key={g.projectId}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/projects/${g.projectId}`}
                  className="text-base font-semibold hover:underline"
                >
                  {g.projectName}
                </Link>
                <Badge color={PROJECT_TYPE_COLORS[g.projectType] || 'gray'} size="xs">
                  {PROJECT_TYPE_LABELS[g.projectType] || g.projectType}
                </Badge>
                <Badge color="gray" size="xs">
                  {PROJECT_STATUS_LABELS[g.projectStatus] || g.projectStatus}
                </Badge>
                {g.projectCode && (
                  <Text className="text-xs text-gray-400">{g.projectCode}</Text>
                )}
              </div>
              <Text className="text-sm text-gray-500">
                {done}/{total} 완료
              </Text>
            </div>
            <div>
              {g.milestones.map(m => (
                <MilestoneRow key={m.milestone_id} m={m} />
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
