// Test rendering helpers. Wrap UI in the providers it expects at runtime
// (QueryClient, Router) so individual tests don't repeat the boilerplate.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'

// Tests want disabled retries and zero stale time so MSW responses are
// observed immediately, without React Query's defaults masking them.
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface ProviderProps {
  children: ReactNode
  client?: QueryClient
  initialRoute?: string
}

export function TestProviders({ children, client, initialRoute = '/' }: ProviderProps) {
  const queryClient = client ?? createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  client?: QueryClient
  initialRoute?: string
}

export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const { client, initialRoute, ...rest } = options
  const queryClient = client ?? createTestQueryClient()
  const result = render(ui, {
    wrapper: ({ children }) => (
      <TestProviders client={queryClient} initialRoute={initialRoute}>
        {children}
      </TestProviders>
    ),
    ...rest,
  })
  return { ...result, queryClient }
}
