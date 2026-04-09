import { apiHandler } from '@/lib/apiHandler'
import { getProjectProgress } from '@/lib/queries'

export const GET = apiHandler((payload) => getProjectProgress(payload), { cache: 'fast' })
