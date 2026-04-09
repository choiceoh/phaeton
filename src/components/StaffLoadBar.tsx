'use client'

import { BarChart, Card, Text } from '@tremor/react'

import type { StaffLoadItem } from '@/lib/types'

export function StaffLoadBar({ staff }: { staff: StaffLoadItem[] }) {
  const chartData = staff
    .filter((s) => Number(s.total_allocation) > 0)
    .map((s) => ({
      name: s.name,
      '할당률(%)': Number(s.total_allocation),
    }))

  return (
    <Card className="h-full">
      <Text className="mb-4 font-medium">인력 할당 현황</Text>
      {chartData.length > 0 ? (
        <BarChart
          data={chartData}
          index="name"
          categories={['할당률(%)']}
          colors={['blue']}
          yAxisWidth={48}
          layout="vertical"
          showAnimation={false}
        />
      ) : (
        <Text className="py-8 text-center text-sm text-stone-400">
          할당된 인력이 없습니다
        </Text>
      )}
    </Card>
  )
}
