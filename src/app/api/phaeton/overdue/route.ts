import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getOverdueMilestones } from '@/lib/queries'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit')
  const payload = await getPayload({ config })
  const overdue = await getOverdueMilestones(payload, limit ? Number(limit) : undefined)
  return NextResponse.json(overdue)
}
