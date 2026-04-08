import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getProjectProgress } from '@/lib/queries'

export async function GET() {
  const payload = await getPayload({ config })
  const projects = await getProjectProgress(payload)
  return NextResponse.json(projects)
}
