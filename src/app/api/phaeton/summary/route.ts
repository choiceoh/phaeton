import { apiHandler } from '@/lib/apiHandler'
import { getSummaryStats } from '@/lib/queries'

export const GET = apiHandler((payload) => getSummaryStats(payload), { cache: 'fast' })
