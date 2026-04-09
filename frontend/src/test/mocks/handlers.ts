// Default MSW handlers — happy-path responses for the most-used endpoints.
// Tests override these per-case via `server.use(...)`.

import { HttpResponse, http } from 'msw'

import type { Collection, User } from '@/lib/types'

export const mockUser: User = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@phaeton.local',
  name: '테스트',
  role: 'director',
  is_active: true,
}

export const mockCollections: Collection[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'projects',
    label: '프로젝트',
    is_system: false,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    fields: [],
  },
]

export const handlers = [
  http.post('/api/auth/login', async () => {
    return HttpResponse.json({
      data: {
        token: 'mock-jwt-token',
        user: mockUser,
      },
    })
  }),

  http.get('/api/auth/me', () => {
    return HttpResponse.json({ data: mockUser })
  }),

  http.get('/api/schema/collections', () => {
    return HttpResponse.json({ data: mockCollections })
  }),

  http.get('/api/data/:slug', () => {
    return HttpResponse.json({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      total_pages: 0,
    })
  }),
]
