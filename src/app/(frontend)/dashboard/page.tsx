import { Card, Metric, Text } from '@tremor/react'
import { getPayload } from 'payload'

import { AlertPanel } from '@/components/AlertPanel'
import { ProjectGrid } from '@/components/ProjectGrid'
import {
  getSummaryStats,
  getProjectProgress,
  getOverdueMilestones,
  getExpiringDocuments,
  getStaffLoad,
} from '@/lib/queries'

import config from '@payload-config'

export default async function DashboardPage() {
  const payload = await getPayload({ config })

  const [summary, projects, overdue, expiring, staffLoad] =
    await Promise.all([
      getSummaryStats(payload),
      getProjectProgress(payload),
      getOverdueMilestones(payload, 5),
      getExpiringDocuments(payload),
      getStaffLoad(payload),
    ])

  const overloadedStaff = staffLoad.filter(
    s => Number(s.total_allocation) > 100,
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">포트폴리오 대시보드</h1>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">프로젝트 현황</h2>
          <ProjectGrid projects={projects} />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">알림</h2>
          <AlertPanel
            overdueMilestones={overdue}
            expiringDocuments={expiring}
            overloadedStaff={overloadedStaff}
          />
        </div>
      </div>
    </div>
  )
}
