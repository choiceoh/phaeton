import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import config from '@payload-config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, 'ok' | 'fail'> = {
    server: 'ok',
    database: 'fail',
    collections: 'fail',
  }

  try {
    const payload = await getPayload({ config })

    // DB 연결 확인
    const users = await payload.find({ collection: 'users', limit: 0 })
    if (users.totalDocs >= 0) {
      checks.database = 'ok'
    }

    // Collection 접근 확인
    const collections = ['sites', 'projects', 'staff', 'project-milestones']
    let allOk = true
    for (const slug of collections) {
      try {
        await payload.find({ collection: slug as 'sites', limit: 0 })
      } catch {
        allOk = false
      }
    }
    checks.collections = allOk ? 'ok' : 'fail'
  } catch {
    // DB 연결 실패 — server는 ok
  }

  const allHealthy = Object.values(checks).every((v) => v === 'ok')

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allHealthy ? 200 : 503 },
  )
}
