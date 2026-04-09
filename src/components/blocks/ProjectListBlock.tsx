'use client'

import { Text } from '@tremor/react'

import { ProjectGrid } from '@/components/ProjectGrid'
import { ProjectTable } from '@/components/ProjectTable'
import type { ProjectProgress } from '@/lib/types'

interface Props {
  title?: string
  viewType?: 'table' | 'grid'
  projects: ProjectProgress[]
}

export function ProjectListBlock({ title, viewType = 'table', projects }: Props) {
  return (
    <div>
      {title && <Text className="mb-3 font-medium">{title}</Text>}
      {viewType === 'grid' ? (
        <ProjectGrid projects={projects} />
      ) : (
        <ProjectTable projects={projects} />
      )}
    </div>
  )
}
