import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getStaffLoad } from '@/lib/queries'

export async function GET() {
  const payload = await getPayload({ config })
  const staffLoad = await getStaffLoad(payload)
  return NextResponse.json(staffLoad)
}
