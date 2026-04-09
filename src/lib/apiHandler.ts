import { NextResponse } from 'next/server'
import { getPayload, type Payload } from 'payload'

import config from '@payload-config'

type CachePreset = 'fast' | 'slow'

const CACHE_HEADERS: Record<CachePreset, string> = {
  fast: 'public, s-maxage=60, stale-while-revalidate=120',
  slow: 'public, s-maxage=300, stale-while-revalidate=600',
}

interface ApiOptions {
  cache?: CachePreset
}

export function apiHandler<T>(
  queryFn: (payload: Payload, request: Request) => Promise<T>,
  options: ApiOptions = {},
) {
  return async function GET(request: Request) {
    try {
      const payload = await getPayload({ config })
      const data = await queryFn(payload, request)
      const headers: HeadersInit = {}
      if (options.cache) {
        headers['Cache-Control'] = CACHE_HEADERS[options.cache]
      }
      return NextResponse.json(data, { headers })
    } catch (error) {
      console.error('[api]', error)
      return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
    }
  }
}
