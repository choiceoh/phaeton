'use client'

import { Card, Badge, ProgressBar, Text } from '@tremor/react'

import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, PROJECT_TYPE_COLORS } from '@/lib/constants'
import { formatCodTarget } from '@/lib/format'
import type { ProjectProgress } from '@/lib/types'

export function ProjectCard({ project }: { project: ProjectProgress }) {
  const progress = Number(project.progress_pct) || 0

  return (
    <Card className="hover:bg-ivory-100">
      <div className="mb-2 flex items-center justify-between">
        <Text className="mr-2 truncate font-medium">{project.name}</Text>
        <Badge color={PROJECT_TYPE_COLORS[project.type] || 'gray'}>
          {PROJECT_TYPE_LABELS[project.type] || project.type}
        </Badge>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <Badge color="gray">{PROJECT_STATUS_LABELS[project.status] || project.status}</Badge>
        {project.capacity_kw && (
          <Text className="text-xs text-stone-500">{project.capacity_kw} kW</Text>
        )}
      </div>
      <ProgressBar value={progress} color={progress === 100 ? 'green' : 'neutral'} />
      <div className="mt-1 flex justify-between">
        <Text className="text-xs text-stone-500">
          {project.done_milestones}/{project.total_milestones} 마일스톤
        </Text>
        {project.cod_target && (
          <Text className="text-xs text-stone-500">COD: {formatCodTarget(project.cod_target)}</Text>
        )}
      </div>
    </Card>
  )
}
