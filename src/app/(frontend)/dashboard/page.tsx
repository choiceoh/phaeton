import { getPayload } from 'payload'

import { AlertPanel } from '@/components/AlertPanel'
import { DashboardCards } from '@/components/DashboardCards'
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

  const [summary, projects, overdue, expiring, staffLoad, settings] =
    await Promise.all([
      getSummaryStats(payload),
      getProjectProgress(payload),
      getOverdueMilestones(payload, 5),
      getExpiringDocuments(payload),
      getStaffLoad(payload),
      payload.findGlobal({ slug: 'site-settings' }),
    ])

  const overloadedStaff = staffLoad.filter(
    s => Number(s.total_allocation) > 100,
  )

  const dash = settings?.dashboard
  const showCards = dash?.showStatusCards !== false
  const showGrid = dash?.showProjectGrid !== false
  const showAlerts = dash?.showAlertPanel !== false

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {dash?.title || '포트폴리오 대시보드'}
      </h1>

      {showCards && <DashboardCards summary={summary} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {showGrid && (
          <div className={showAlerts ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <h2 className="text-lg font-semibold mb-3">
              {dash?.projectSectionTitle || '프로젝트 현황'}
            </h2>
            <ProjectGrid projects={projects} />
          </div>
        )}
        {showAlerts && (
          <div className={showGrid ? '' : 'lg:col-span-3'}>
            <h2 className="text-lg font-semibold mb-3">
              {dash?.alertSectionTitle || '알림'}
            </h2>
            <AlertPanel
              overdueMilestones={overdue}
              expiringDocuments={expiring}
              overloadedStaff={overloadedStaff}
            />
          </div>
        )}
      </div>
    </div>
  )
}
