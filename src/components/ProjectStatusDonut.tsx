'use client'

import { Card, DonutChart, Text } from '@tremor/react'

import { PROJECT_STATUS_LABELS } from '@/lib/constants'
import type { ProjectProgress } from '@/lib/types'

const STATUS_COLORS: Record<string, string> = {
  'gen-permit': 'amber',
  'dev-permit': 'sky',
  civil: 'blue',
  'structural-elec': 'indigo',
  inspection: 'green',
  'pre-cod': 'emerald',
}

export function ProjectStatusDonut({ projects }: { projects: ProjectProgress[] }) {
  const counts = new Map<string, number>()
  for (const p of projects) {
    counts.set(p.status, (counts.get(p.status) || 0) + 1)
  }

  const chartData = Array.from(counts.entries()).map(([status, count]) => ({
    name: PROJECT_STATUS_LABELS[status] || status,
    value: count,
  }))

  const colors = Array.from(counts.keys()).map((s) => STATUS_COLORS[s] || 'gray')

  return (
    <Card className="h-full">
      <Text className="mb-4 font-medium">프로젝트 단계 분포</Text>
      {chartData.length > 0 ? (
        <DonutChart
          data={chartData}
          category="value"
          index="name"
          colors={colors}
          showAnimation={false}
        />
      ) : (
        <Text className="py-8 text-center text-sm text-stone-400">프로젝트 데이터가 없습니다</Text>
      )}
    </Card>
  )
}
