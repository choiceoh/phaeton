import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCollections } from '@/hooks/useCollections'
import { mockCollections } from '@/test/mocks/handlers'
import { TestProviders } from '@/test/utils'

describe('useCollections', () => {
  it('returns the list of collections from /api/schema/collections', async () => {
    const { result } = renderHook(() => useCollections(), {
      wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(mockCollections.length)
    expect(result.current.data?.[0].slug).toBe('projects')
  })
})
