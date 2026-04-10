import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { User } from '@/lib/types'

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.auth.users(),
    queryFn: () => api.get<User[]>('/users'),
  })
}
