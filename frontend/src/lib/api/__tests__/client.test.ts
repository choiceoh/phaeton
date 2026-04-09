import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { api } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import { server } from '@/test/mocks/server'

describe('api client', () => {
  it('unwraps the {data} envelope on success', async () => {
    server.use(
      http.get('/api/widget', () => HttpResponse.json({ data: { id: 'abc', name: 'X' } })),
    )

    const result = await api.get<{ id: string; name: string }>('/widget')
    expect(result).toEqual({ id: 'abc', name: 'X' })
  })

  it('returns the raw envelope when opts.raw is set (list endpoints)', async () => {
    server.use(
      http.get('/api/widgets', () =>
        HttpResponse.json({ data: [], total: 0, page: 1, limit: 20, total_pages: 0 }),
      ),
    )

    const result = await api.getList<unknown>('/widgets')
    expect(result.total).toBe(0)
    expect(result.page).toBe(1)
  })

  it('throws ApiError with isNotFound() on 404', async () => {
    server.use(http.get('/api/missing', () => HttpResponse.json({ error: 'gone' }, { status: 404 })))

    await expect(api.get('/missing')).rejects.toMatchObject({
      status: 404,
    })
    try {
      await api.get('/missing')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).isNotFound()).toBe(true)
    }
  })

  it('exposes the server-supplied error message on validation failures', async () => {
    server.use(
      http.post('/api/widget', () =>
        HttpResponse.json({ error: 'name is required' }, { status: 400 }),
      ),
    )

    await expect(api.post('/widget', {})).rejects.toMatchObject({
      status: 400,
      message: 'name is required',
    })
  })
})
