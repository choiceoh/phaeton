'use client'

import { Card, Badge, List, ListItem, Text } from '@tremor/react'
import Link from 'next/link'

import { CodChart } from '@/components/CodChart'
import { DashboardCards } from '@/components/DashboardCards'
import { ExpiringDocsTimeline } from '@/components/ExpiringDocsTimeline'
import { ProjectGrid } from '@/components/ProjectGrid'
import { ProjectProgressChart } from '@/components/ProjectProgressChart'
import { ProjectStatusDonut } from '@/components/ProjectStatusDonut'
import { StaffLoadBar } from '@/components/StaffLoadBar'
import { StaffTable } from '@/components/StaffTable'
import { fmtNum } from '@/lib/format'
import type {
  SummaryStats,
  ProjectProgress,
  OverdueMilestone,
  ExpiringDocument,
  StaffLoadItem,
  MonthlyMilestoneCount,
  MonthlyCodData,
} from '@/lib/types'

export interface DashboardData {
  summary: SummaryStats
  projects: ProjectProgress[]
  overdue: OverdueMilestone[]
  expiring: ExpiringDocument[]
  overloadedStaff: StaffLoadItem[]
  staffLoad: StaffLoadItem[]
  trends: MonthlyMilestoneCount[]
  codData: MonthlyCodData[]
}

export function WidgetRenderer({ widgetId, data }: { widgetId: string; data: DashboardData }) {
  switch (widgetId) {
    case 'status-cards':
      return <DashboardCards summary={data.summary} />

    case 'project-grid':
      return <ProjectGrid projects={data.projects} />

    case 'alert-overdue':
      return <OverdueWidget items={data.overdue} />

    case 'alert-expiring':
      return <ExpiringWidget items={data.expiring} />

    case 'alert-overloaded':
      return <OverloadedWidget items={data.overloadedStaff} />

    case 'staff-table':
      return <StaffTable staff={data.staffLoad} />

    case 'progress-chart':
      return <ProjectProgressChart data={data.trends} />

    case 'cod-chart':
      return <CodChart data={data.codData} />

    case 'status-donut':
      return <ProjectStatusDonut projects={data.projects} />

    case 'staff-load-chart':
      return <StaffLoadBar staff={data.staffLoad} />

    case 'expiring-calendar':
      return <ExpiringDocsTimeline documents={data.expiring} />

    default:
      return (
        <Card className="flex h-full items-center justify-center">
          <Text className="text-gray-400">알 수 없는 위젯: {widgetId}</Text>
        </Card>
      )
  }
}

function OverdueWidget({ items }: { items: OverdueMilestone[] }) {
  return (
    <Card className="h-full overflow-auto">
      <div className="mb-3 flex items-center gap-2">
        <Text className="font-medium">지연 마일스톤</Text>
        {items.length > 0 && <Badge color="red">{fmtNum(items.length)}</Badge>}
      </div>
      {items.length > 0 ? (
        <List>
          {items.map((m) => (
            <ListItem key={m.id}>
              <div>
                <Text className="text-sm font-medium">{m.name}</Text>
                <Link
                  href={`/projects/${m.project_id}`}
                  className="text-xs text-gray-500 hover:text-blue-600"
                >
                  {m.project_name}
                </Link>
              </div>
              <Badge color="red">{fmtNum(m.days_overdue)}일 지연</Badge>
            </ListItem>
          ))}
        </List>
      ) : (
        <Text className="text-sm text-gray-400">지연 항목 없음</Text>
      )}
    </Card>
  )
}

function ExpiringWidget({ items }: { items: ExpiringDocument[] }) {
  return (
    <Card className="h-full overflow-auto">
      <div className="mb-3 flex items-center gap-2">
        <Text className="font-medium">만료 임박 서류</Text>
        {items.length > 0 && <Badge color="amber">{fmtNum(items.length)}</Badge>}
      </div>
      {items.length > 0 ? (
        <List>
          {items.map((d) => (
            <ListItem key={d.id}>
              <div>
                <Text className="text-sm font-medium">{d.title}</Text>
                <Link
                  href={`/projects/${d.project_id}`}
                  className="text-xs text-gray-500 hover:text-blue-600"
                >
                  {d.project_name}
                </Link>
              </div>
              <Badge color="amber">{fmtNum(d.days_until_expiry)}일 남음</Badge>
            </ListItem>
          ))}
        </List>
      ) : (
        <Text className="text-sm text-gray-400">만료 임박 서류 없음</Text>
      )}
    </Card>
  )
}

function OverloadedWidget({ items }: { items: StaffLoadItem[] }) {
  return (
    <Card className="h-full overflow-auto">
      <div className="mb-3 flex items-center gap-2">
        <Text className="font-medium">과할당 인력</Text>
        {items.length > 0 && <Badge color="red">{fmtNum(items.length)}</Badge>}
      </div>
      {items.length > 0 ? (
        <List>
          {items.map((s) => (
            <ListItem key={s.id}>
              <div>
                <Text className="text-sm font-medium">{s.name}</Text>
                <Text className="text-xs text-gray-500">
                  {s.role || '직무 미지정'} · {fmtNum(s.active_projects)}개 프로젝트
                </Text>
              </div>
              <Badge color="red">{fmtNum(s.total_allocation)}%</Badge>
            </ListItem>
          ))}
        </List>
      ) : (
        <Text className="text-sm text-gray-400">과할당 인력 없음</Text>
      )}
    </Card>
  )
}
