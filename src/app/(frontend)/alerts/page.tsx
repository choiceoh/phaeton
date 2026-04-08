import { AlertsView } from '@/components/AlertsView'
import {
  getCachedOverdueMilestones,
  getCachedExpiringDocuments,
  getCachedStaffLoad,
} from '@/lib/cachedQueries'

export const revalidate = 60

export default async function AlertsPage() {
  const [overdue, expiring, staffLoad] = await Promise.all([
    getCachedOverdueMilestones(),
    getCachedExpiringDocuments(),
    getCachedStaffLoad(),
  ])

  const overloaded = staffLoad.filter((s) => Number(s.total_allocation) > 100)

  return <AlertsView overdue={overdue} expiring={expiring} overloaded={overloaded} />
}
