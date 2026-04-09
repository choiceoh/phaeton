import { apiHandler } from '@/lib/apiHandler'
import { getOverdueMilestones } from '@/lib/queries'

export const GET = apiHandler(
  (payload, request) => {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit')
    return getOverdueMilestones(payload, limit ? Number(limit) : undefined)
  },
  { cache: 'slow' },
)
