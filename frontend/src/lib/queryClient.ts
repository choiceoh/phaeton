import { QueryClient } from '@tanstack/react-query'

import { ApiError } from './api'

// Single QueryClient for the whole app. Defaults are tuned for an internal
// admin tool: aggressive cache reuse, no automatic refetch on focus (the user
// is usually inside a flow when they switch tabs).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s — most schema reads can tolerate slight staleness
      gcTime: 5 * 60_000, // 5min — keep recently-used queries warm
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry 4xx (validation, auth, not found) — they won't fix themselves.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false
        }
        return failureCount < 2
      },
    },
    mutations: {
      // Mutations never auto-retry — duplicate writes are dangerous.
      retry: false,
    },
  },
})
