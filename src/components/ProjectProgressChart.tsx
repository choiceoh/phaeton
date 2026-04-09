'use client'

import { BarChart, Card, Text } from '@tremor/react'

import type { MonthlyMilestoneCount } from '@/lib/types'

export function ProjectProgressChart({ data }: { data: MonthlyMilestoneCount[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    '완료 마일스톤': Number(d.completed),
  }))

  return (
    <Card className="h-full">
      <Text className="mb-4 font-medium">월별 마일스톤 완료 추이</Text>
      {chartData.length > 0 ? (
        <BarChart
          data={chartData}
          index="month"
          categories={['완료 마일스톤']}
          colors={['blue']}
          yAxisWidth={40}
          showAnimation={false}
        />
      ) : (
        <Text className="py-8 text-center text-sm text-stone-400">
          완료된 마일스톤 데이터가 없습니다
        </Text>
      )}
    </Card>
  )
}
