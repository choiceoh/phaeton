'use client'

import { Text } from '@tremor/react'

import { DashboardCards } from '@/components/DashboardCards'
import type { SummaryStats } from '@/lib/types'

interface Props {
  title?: string
  summary: SummaryStats
}

export function StatsRowBlock({ title, summary }: Props) {
  return (
    <div>
      {title && <Text className="mb-3 font-medium">{title}</Text>}
      <DashboardCards summary={summary} />
    </div>
  )
}
