import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { AggregateResult } from '@/lib/types'

// QueryParams describes the URL query string options accepted by the
// dynamic List endpoint. Kept generic so callers can build any combination.
export interface EntryListParams {
  page?: number
  limit?: number
  sort?: string // e.g. "-created_at" or "name,-due_date"
  expand?: string // comma-separated relation field slugs
  filters?: Record<string, string> // { status: "eq:active", capacity: "gte:100" }
}

export interface EntryListResult {
  data: Record<string, unknown>[]
  total: number
  page: number
  limit: number
  total_pages: number
}

function buildQueryString(params: EntryListParams): string {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.limit) search.set('limit', String(params.limit))
  if (params.sort) search.set('sort', params.sort)
  if (params.expand) search.set('expand', params.expand)
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value) search.set(key, value)
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

// useEntries fetches a paginated list of entries for a collection.
// Pagination + filter changes use keepPreviousData so the table doesn't
// flash empty between pages.
export function useEntries(slug: string | undefined, params: EntryListParams = {}) {
  return useQuery({
    queryKey: queryKeys.entries.list(slug ?? '', params as Record<string, unknown>),
    queryFn: () =>
      api.getList<Record<string, unknown>>(`/data/${slug}${buildQueryString(params)}`),
    enabled: !!slug,
    placeholderData: keepPreviousData,
  })
}

export function useEntry(slug: string | undefined, id: string | undefined, expand?: string) {
  return useQuery({
    queryKey: queryKeys.entries.detail(slug ?? '', id ?? ''),
    queryFn: () =>
      api.get<Record<string, unknown>>(
        `/data/${slug}/${id}${expand ? `?expand=${expand}` : ''}`,
      ),
    enabled: !!slug && !!id,
  })
}

export function useCreateEntry(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Record<string, unknown>>(`/data/${slug}`, body),
    onSuccess: () => {
      // Invalidate every list query for this collection. Detail queries are
      // unaffected because new rows have a fresh id.
      qc.invalidateQueries({ queryKey: queryKeys.entries.all })
    },
  })
}

export function useUpdateEntry(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/data/${slug}/${id}`, body),
    onSuccess: (updated, { id }) => {
      qc.setQueryData(queryKeys.entries.detail(slug, id), updated)
      qc.invalidateQueries({ queryKey: queryKeys.entries.all })
    },
  })
}

export function useBatchUpdateEntry(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (updates: { id: string; fields: Record<string, unknown> }[]) =>
      api.patch<Record<string, unknown>[]>(`/data/${slug}/batch`, { updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entries.all })
    },
  })
}

export function useDeleteEntry(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<{ status: string }>(`/data/${slug}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entries.all })
    },
  })
}

// useAggregate fetches aggregate data (count/sum/avg/min/max) for a collection.
export function useAggregate(
  slug: string | undefined,
  params: { group: string; fn?: string; field?: string },
) {
  const search = new URLSearchParams()
  search.set('group', params.group)
  if (params.fn) search.set('fn', params.fn)
  if (params.field) search.set('field', params.field)

  return useQuery({
    queryKey: [...queryKeys.entries.all, slug, 'aggregate', params],
    queryFn: () =>
      api.get<AggregateResult[]>(`/data/${slug}/aggregate?${search.toString()}`),
    enabled: !!slug && !!params.group,
  })
}

// useCollectionCount fetches the total entry count for a collection (lightweight).
export function useCollectionCount(slug: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.entries.all, slug, 'count'],
    queryFn: async () => {
      const res = await api.getList<Record<string, unknown>>(`/data/${slug}?limit=1`)
      return res.total
    },
    enabled: !!slug,
    staleTime: 60_000,
  })
}
