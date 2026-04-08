import { getPayload } from 'payload'

import { StaffTable } from '@/components/StaffTable'
import { getStaffLoad } from '@/lib/queries'

import config from '@payload-config'

export default async function StaffPage() {
  const payload = await getPayload({ config })
  const staff = await getStaffLoad(payload)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">인력 현황</h1>
      <StaffTable staff={staff} />
    </div>
  )
}
