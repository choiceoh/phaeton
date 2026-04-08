import { getPayload } from 'payload'

import { AlertsView } from '@/components/AlertsView'
import {
  getOverdueMilestones,
  getExpiringDocuments,
  getStaffLoad,
} from '@/lib/queries'

import config from '@payload-config'

export default async function AlertsPage() {
  const payload = await getPayload({ config })

  const [overdue, expiring, staffLoad] = await Promise.all([
    getOverdueMilestones(payload),
    getExpiringDocuments(payload),
    getStaffLoad(payload),
  ])

  const overloaded = staffLoad.filter(
    s => Number(s.total_allocation) > 100,
  )

  return (
    <AlertsView
      overdue={overdue}
      expiring={expiring}
      overloaded={overloaded}
    />
  )
}
