import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCurrentUser } from '@/hooks/useAuth'
import { mockUser } from '@/test/mocks/handlers'
import { TestProviders } from '@/test/utils'

describe('useCurrentUser', () => {
  it('fetches the current user from /api/auth/me and unwraps the envelope', async () => {
    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.email).toBe(mockUser.email)
    expect(result.current.data?.role).toBe('director')
  })
})
