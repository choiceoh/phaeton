import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { getOverdueMilestones } from '@/lib/queries'
import { parseLimit } from '@/lib/validation'

import config from '@payload-config'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = parseLimit(searchParams)
  const payload = await getPayload({ config })
  const overdue = await getOverdueMilestones(payload, limit)
  return NextResponse.json(overdue, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
