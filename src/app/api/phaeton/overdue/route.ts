import { apiHandler } from '@/lib/apiHandler'
import { getOverdueMilestones } from '@/lib/queries'
import { parseLimit } from '@/lib/validation'

export const GET = apiHandler(
  (payload, request) => {
    const { searchParams } = new URL(request.url)
    const limit = parseLimit(searchParams)
    return getOverdueMilestones(payload, limit)
  },
  { cache: 'slow' },
)
