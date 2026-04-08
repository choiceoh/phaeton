import { getPayload } from 'payload'
import { headers } from 'next/headers'

import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
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

  const headersList = await headers()
  let userId: number | null = null
  try {
    const { user } = await payload.auth({ headers: headersList })
    userId = user?.id ?? null
  } catch {
    // 미인증 사용자 — 기본 레이아웃 사용
  }

  const [summary, projects, overdue, expiring, staffLoad] =
    await Promise.all([
      getSummaryStats(payload),
      getProjectProgress(payload),
      getOverdueMilestones(payload),
      getExpiringDocuments(payload),
      getStaffLoad(payload),
    ])

  const overloadedStaff = staffLoad.filter(
    (s) => Number(s.total_allocation) > 100,
  )

  // DashboardConfigs 컬렉션은 payload-types 재생성 전이라 any 캐스트 사용
  let savedConfig = null
  if (userId) {
    try {
      const configs = await (payload as any).find({
        collection: 'dashboard-configs',
        where: {
          user: { equals: userId },
          isDefault: { equals: true },
        },
        limit: 1,
      })
      if (configs.docs.length > 0) {
        const doc = configs.docs[0]
        savedConfig = {
          id: doc.id as number,
          layouts: doc.layouts as Record<string, any[]>,
          widgets: doc.widgets as string[],
        }
      }
    } catch {
      // 컬렉션 미생성 시 무시
    }
  }

  return (
    <DashboardLayout
      data={{
        summary,
        projects,
        overdue,
        expiring,
        overloadedStaff,
        staffLoad,
      }}
      userId={userId || 0}
      savedConfig={savedConfig}
    />
  )
}
