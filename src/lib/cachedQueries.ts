import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import {
  getSummaryStats,
  getProjectProgress,
  getOverdueMilestones,
  getExpiringDocuments,
  getStaffLoad,
} from '@/lib/queries'

import config from '@payload-config'

/**
 * 대시보드 집계 쿼리 캐시 래퍼
 *
 * unstable_cache는 서버 컴포넌트 밖에서 Payload 인스턴스를 직접 받을 수 없으므로
 * 래퍼 내부에서 getPayload를 호출한다.
 * revalidate 초 단위로 캐시가 자동 갱신된다.
 */

export const getCachedSummaryStats = unstable_cache(
  async () => {
    const payload = await getPayload({ config })
    return getSummaryStats(payload)
  },
  ['dashboard-summary-stats'],
  { revalidate: 60, tags: ['dashboard', 'summary'] },
)

export const getCachedProjectProgress = unstable_cache(
  async () => {
    const payload = await getPayload({ config })
    return getProjectProgress(payload)
  },
  ['dashboard-project-progress'],
  { revalidate: 60, tags: ['dashboard', 'projects'] },
)

export const getCachedOverdueMilestones = unstable_cache(
  async (limit?: number) => {
    const payload = await getPayload({ config })
    return getOverdueMilestones(payload, limit)
  },
  ['dashboard-overdue-milestones'],
  { revalidate: 300, tags: ['dashboard', 'overdue'] },
)

export const getCachedExpiringDocuments = unstable_cache(
  async () => {
    const payload = await getPayload({ config })
    return getExpiringDocuments(payload)
  },
  ['dashboard-expiring-documents'],
  { revalidate: 300, tags: ['dashboard', 'documents'] },
)

export const getCachedStaffLoad = unstable_cache(
  async () => {
    const payload = await getPayload({ config })
    return getStaffLoad(payload)
  },
  ['dashboard-staff-load'],
  { revalidate: 300, tags: ['dashboard', 'staff'] },
)
