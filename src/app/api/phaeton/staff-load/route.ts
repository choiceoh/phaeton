import { apiHandler } from '@/lib/apiHandler'
import { getStaffLoad } from '@/lib/queries'

export const GET = apiHandler((payload) => getStaffLoad(payload), { cache: 'slow' })
