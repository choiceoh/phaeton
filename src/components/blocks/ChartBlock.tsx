'use client'

import { BarChart, Card, DonutChart, Text } from '@tremor/react'

import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/constants'
import type { ProjectProgress, StaffLoadItem } from '@/lib/types'

interface Props {
  title?: string
  chartType?: 'bar' | 'donut'
  dataSource?: 'project-by-status' | 'project-by-type' | 'staff-allocation'
  projects: ProjectProgress[]
  staffLoad: StaffLoadItem[]
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const key = keyFn(item)
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

function buildChartData(
  dataSource: string,
  projects: ProjectProgress[],
  staffLoad: StaffLoadItem[],
) {
  if (dataSource === 'project-by-status') {
    const counts = countBy(projects, (p) => p.status)
    return Object.entries(counts).map(([key, value]) => ({
      name: PROJECT_STATUS_LABELS[key] || key,
      value,
    }))
  }

  if (dataSource === 'project-by-type') {
    const counts = countBy(projects, (p) => p.type)
    return Object.entries(counts).map(([key, value]) => ({
      name: PROJECT_TYPE_LABELS[key] || key,
      value,
    }))
  }

  if (dataSource === 'staff-allocation') {
    const ranges = [
      { name: '0-50%', min: 0, max: 50 },
      { name: '51-80%', min: 51, max: 80 },
      { name: '81-100%', min: 81, max: 100 },
      { name: '100% 초과', min: 101, max: Infinity },
    ]
    return ranges.map((r) => ({
      name: r.name,
      value: staffLoad.filter((s) => {
        const alloc = Number(s.total_allocation)
        return alloc >= r.min && alloc <= r.max
      }).length,
    }))
  }

  return []
}

export function ChartBlock({
  title,
  chartType = 'bar',
  dataSource = 'project-by-status',
  projects,
  staffLoad,
}: Props) {
  const data = buildChartData(dataSource, projects, staffLoad)

  return (
    <Card>
      {title && <Text className="mb-3 font-medium">{title}</Text>}
      {chartType === 'donut' ? (
        <DonutChart data={data} category="value" index="name" className="h-60" />
      ) : (
        <BarChart data={data} categories={['value']} index="name" className="h-60" />
      )}
    </Card>
  )
}
