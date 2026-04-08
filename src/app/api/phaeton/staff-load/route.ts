import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { getStaffLoad } from '@/lib/queries'

import config from '@payload-config'

export async function GET() {
  const payload = await getPayload({ config })
  const staffLoad = await getStaffLoad(payload)
  return NextResponse.json(staffLoad, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
