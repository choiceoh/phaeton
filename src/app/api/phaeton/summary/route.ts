import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { getSummaryStats } from '@/lib/queries'

import config from '@payload-config'

export async function GET() {
  const payload = await getPayload({ config })
  const stats = await getSummaryStats(payload)
  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
