'use client'

import { BarChart, Card, Text } from '@tremor/react'

import type { MonthlyCodData } from '@/lib/types'

export function CodChart({ data }: { data: MonthlyCodData[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    '프로젝트 수': Number(d.project_count),
    '총 용량(kW)': Number(d.total_kw),
  }))

  return (
    <Card className="h-full">
      <Text className="mb-4 font-medium">월별 COD 현황</Text>
      {chartData.length > 0 ? (
        <BarChart
          data={chartData}
          index="month"
          categories={['프로젝트 수', '총 용량(kW)']}
          colors={['green', 'blue']}
          yAxisWidth={48}
          showAnimation={false}
        />
      ) : (
        <Text className="py-8 text-center text-sm text-stone-400">
          COD 데이터가 없습니다
        </Text>
      )}
    </Card>
  )
}
