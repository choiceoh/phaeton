'use client'

import { Card, Metric, Text } from '@tremor/react'

interface SummaryStats {
  gen_permit_count: number | string
  dev_permit_count: number | string
  civil_count: number | string
  structural_elec_count: number | string
  inspection_count: number | string
  pre_cod_count: number | string
  delayed_projects: number | string
}

export function DashboardCards({ summary }: { summary: SummaryStats }) {
  return (
    <div
      role="region"
      aria-label="프로젝트 현황 요약"
      className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7"
    >
      <Card>
        <Text>발전허가</Text>
        <Metric>{summary.gen_permit_count}</Metric>
      </Card>
      <Card decoration="top" decorationColor="amber">
        <Text>개발허가</Text>
        <Metric>{summary.dev_permit_count}</Metric>
      </Card>
      <Card decoration="top" decorationColor="stone">
        <Text>토목</Text>
        <Metric>{summary.civil_count}</Metric>
      </Card>
      <Card decoration="top" decorationColor="stone">
        <Text>구조물·전기</Text>
        <Metric>{summary.structural_elec_count}</Metric>
      </Card>
      <Card decoration="top" decorationColor="amber">
        <Text>사용전 검사</Text>
        <Metric>{summary.inspection_count}</Metric>
      </Card>
      <Card decoration="top" decorationColor="green">
        <Text>준공대기</Text>
        <Metric>{summary.pre_cod_count}</Metric>
      </Card>
      <Card decoration="top" decorationColor="red">
        <Text>지연</Text>
        <Metric>{summary.delayed_projects}</Metric>
      </Card>
    </div>
  )
}
