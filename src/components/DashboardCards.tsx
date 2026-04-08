'use client'

import { Card, Metric, Text } from '@tremor/react'

interface SummaryStats {
  active_projects: number | string
  delayed_projects: number | string
  due_this_week: number | string
  overloaded_staff: number | string
}

export function DashboardCards({ summary }: { summary: SummaryStats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <Text>진행중 프로젝트</Text>
        <Metric>{summary.active_projects}</Metric>
      </Card>
      <Card decoration="top" decorationColor="red">
        <Text>지연 프로젝트</Text>
        <Metric>{summary.delayed_projects}</Metric>
      </Card>
      <Card decoration="top" decorationColor="amber">
        <Text>금주 마감</Text>
        <Metric>{summary.due_this_week}</Metric>
      </Card>
      <Card decoration="top" decorationColor="red">
        <Text>과할당 인력</Text>
        <Metric>{summary.overloaded_staff}</Metric>
      </Card>
    </div>
  )
}
