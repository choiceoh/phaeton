import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { getOverdueMilestones } from '@/lib/queries'

import config from '@payload-config'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit')
  const payload = await getPayload({ config })
  const overdue = await getOverdueMilestones(payload, limit ? Number(limit) : undefined)
  return NextResponse.json(overdue, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
