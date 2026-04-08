import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { getProjectProgress } from '@/lib/queries'

import config from '@payload-config'

export async function GET() {
  const payload = await getPayload({ config })
  const projects = await getProjectProgress(payload)
  return NextResponse.json(projects, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
