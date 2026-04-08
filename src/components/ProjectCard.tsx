'use client'

import { Card, Badge, ProgressBar, Text } from '@tremor/react'

import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
} from '@/lib/constants'
import type { ProjectProgress } from '@/lib/types'

export function ProjectCard({ project }: { project: ProjectProgress }) {
  const progress = Number(project.progress_pct) || 0

  return (
    <Card className="hover:bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <Text className="font-medium truncate mr-2">{project.name}</Text>
        <Badge color={PROJECT_TYPE_COLORS[project.type] || 'gray'}>
          {PROJECT_TYPE_LABELS[project.type] || project.type}
        </Badge>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Badge color="gray">
          {PROJECT_STATUS_LABELS[project.status] || project.status}
        </Badge>
        {project.capacity_kw && (
          <Text className="text-xs text-gray-500">
            {project.capacity_kw} kW
          </Text>
        )}
      </div>
      <ProgressBar
        value={progress}
        color={progress === 100 ? 'green' : 'blue'}
      />
      <div className="flex justify-between mt-1">
        <Text className="text-xs text-gray-500">
          {project.done_milestones}/{project.total_milestones} 마일스톤
        </Text>
        {project.cod_target && (
          <Text className="text-xs text-gray-500">
            COD: {project.cod_target}
          </Text>
        )}
      </div>
    </Card>
  )
}
