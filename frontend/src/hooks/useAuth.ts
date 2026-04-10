import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { User } from '@/lib/types'

interface LoginInput {
  email: string
  password: string
}

interface LoginResponse {
  token: string
  user: User
}

// useCurrentUser fetches /api/auth/me. Cached aggressively — only refetched
// when explicitly invalidated (login, logout, role change).
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => api.get<User>('/auth/me'),
    staleTime: Infinity, // never stale until invalidated
    retry: false, // 401 should not retry — useAuth handles it
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (input: LoginInput) => api.post<LoginResponse>('/auth/login', input),
    onSuccess: (data) => {
      // Seed the /me cache with the user we just got back so the layout
      // doesn't have to refetch.
      queryClient.setQueryData(queryKeys.auth.me(), data.user)
      navigate('/', { replace: true })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.auth.all })
      navigate('/login', { replace: true })
    },
  })
}

// hasRole returns true if the user has at least one of the listed roles.
export function hasRole(user: User | null | undefined, roles: User['role'][]): boolean {
  if (!user) return false
  return roles.includes(user.role)
}
