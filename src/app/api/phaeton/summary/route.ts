import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getSummaryStats } from '@/lib/queries'

export async function GET() {
  const payload = await getPayload({ config })
  const stats = await getSummaryStats(payload)
  return NextResponse.json(stats)
}
