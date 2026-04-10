import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { AggregateResult, TotalsResult } from '@/lib/types'

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
    onMutate: async (body) => {
      const collectionKey = queryKeys.entries.collection(slug)
      await qc.cancelQueries({ queryKey: collectionKey })
      const previousLists = qc.getQueriesData<EntryListResult>({
        queryKey: collectionKey,
      })
      const tempEntry = {
        ...body,
        id: `__temp_${Date.now()}`,
        created_at: new Date().toISOString(),
        _optimistic: true,
      }
      qc.setQueriesData<EntryListResult>(
        { queryKey: collectionKey },
        (old) => {
          if (!old?.data) return old
          return { ...old, data: [tempEntry, ...old.data], total: old.total + 1 }
        },
      )
      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          qc.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entries.collection(slug) })
    },
  })
}

export function useUpdateEntry(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<Record<string, unknown>>(`/data/${slug}/${id}`, body),
    onMutate: async ({ id, body }) => {
      const collectionKey = queryKeys.entries.collection(slug)
      await qc.cancelQueries({ queryKey: collectionKey })
      const previousLists = qc.getQueriesData<EntryListResult>({
        queryKey: collectionKey,
      })
      qc.setQueriesData<EntryListResult>(
        { queryKey: collectionKey },
        (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.map((row) =>
              String(row.id) === id ? { ...row, ...body } : row,
            ),
          }
        },
      )
      return { previousLists }
    },
    onSuccess: (updated, { id }) => {
      qc.setQueryData(queryKeys.entries.detail(slug, id), updated)
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          qc.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entries.collection(slug) })
    },
  })
}

export function useBatchUpdateEntry(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (updates: { id: string; fields: Record<string, unknown>; _version?: number }[]) =>
      api.patch<Record<string, unknown>[]>(`/data/${slug}/batch`, { updates }),
    onMutate: async (updates) => {
      const collectionKey = queryKeys.entries.collection(slug)
      await qc.cancelQueries({ queryKey: collectionKey })
      const previousLists = qc.getQueriesData<EntryListResult>({
        queryKey: collectionKey,
      })
      const updateMap = new Map(updates.map((u) => [u.id, u.fields]))
      qc.setQueriesData<EntryListResult>(
        { queryKey: collectionKey },
        (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.map((row) => {
              const fields = updateMap.get(String(row.id))
              return fields ? { ...row, ...fields } : row
            }),
          }
        },
      )
      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          qc.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entries.collection(slug) })
    },
  })
}

export function useDeleteEntry(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<{ status: string }>(`/data/${slug}/${id}`),
    onMutate: async (id) => {
      const collectionKey = queryKeys.entries.collection(slug)
      await qc.cancelQueries({ queryKey: collectionKey })
      const previousLists = qc.getQueriesData<EntryListResult>({
        queryKey: collectionKey,
      })
      qc.setQueriesData<EntryListResult>(
        { queryKey: collectionKey },
        (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.filter((row) => String(row.id) !== id),
            total: Math.max(0, old.total - 1),
          }
        },
      )
      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          qc.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entries.collection(slug) })
    },
  })
}

export function useBulkDeleteEntries(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api.del<{ deleted: number }>(`/data/${slug}/bulk`, { ids }),
    onMutate: async (ids) => {
      const collectionKey = queryKeys.entries.collection(slug)
      await qc.cancelQueries({ queryKey: collectionKey })
      const previousLists = qc.getQueriesData<EntryListResult>({
        queryKey: collectionKey,
      })
      const idSet = new Set(ids)
      qc.setQueriesData<EntryListResult>(
        { queryKey: collectionKey },
        (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.filter((row) => !idSet.has(String(row.id))),
            total: Math.max(0, old.total - ids.length),
          }
        },
      )
      return { previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          qc.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.entries.collection(slug) })
    },
  })
}

// useTotals fetches server-side totals (sum/avg/min/max/count) for all numeric
// fields in a collection. Supports same filter params as List.
export function useTotals(slug: string | undefined, filters?: Record<string, string>) {
  const search = new URLSearchParams()
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value) search.set(key, value)
    }
  }
  const qs = search.toString()

  return useQuery({
    queryKey: [...queryKeys.entries.all, slug, 'totals', filters],
    queryFn: () =>
      api.get<TotalsResult>(`/data/${slug}/totals${qs ? `?${qs}` : ''}`),
    enabled: !!slug,
    staleTime: 30_000,
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

export function useEntryDefaults(slug: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.entries.all, slug, 'defaults'],
    queryFn: () => api.get<Record<string, unknown>>(`/data/${slug}/defaults`),
    enabled: !!slug,
    staleTime: 120_000,
  })
}

export interface SimilarRecord {
  id: string
  value: string
  created_at: string
}

export function useSimilarRecords(slug: string | undefined, query: string, field?: string) {
  return useQuery({
    queryKey: [...queryKeys.entries.all, slug, 'similar', query, field],
    queryFn: () => {
      const params = new URLSearchParams({ q: query })
      if (field) params.set('field', field)
      return api.get<SimilarRecord[]>(`/data/${slug}/similar?${params}`)
    },
    enabled: !!slug && query.length >= 2,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// View-specific endpoints (server-computed)
// ---------------------------------------------------------------------------

export interface CalendarSpan {
  entry: Record<string, unknown>
  label: string
  startCol: number
  colSpan: number
  track: number
  isStart: boolean
  isEnd: boolean
}

export interface CalendarWeek {
  start: string
  end: string
  days: string[]
  spans: CalendarSpan[]
  singles: Record<string, Record<string, unknown>[]>
}

export interface CalendarViewResult {
  year: number
  month: number
  weeks: CalendarWeek[]
}

export function useCalendarView(
  slug: string | undefined,
  params: {
    year: number
    month: number
    dateField: string
    endDateField?: string
    filters?: Record<string, string>
  },
) {
  const search = new URLSearchParams()
  search.set('year', String(params.year))
  search.set('month', String(params.month))
  search.set('date_field', params.dateField)
  if (params.endDateField) search.set('end_date_field', params.endDateField)
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value) search.set(key, value)
    }
  }

  return useQuery({
    queryKey: [...queryKeys.entries.all, slug, 'calendar', params],
    queryFn: () =>
      api.get<CalendarViewResult>(`/data/${slug}/calendar?${search.toString()}`),
    enabled: !!slug && !!params.dateField,
    staleTime: 30_000,
  })
}

export interface GanttRow {
  id: string
  title: string
  startDate: string
  endDate: string
  progress: number | null
  colorKey: string
  dependencies: string[]
  user?: string
  status?: string
}

export interface GanttMonth {
  label: string
  startIndex: number
  span: number
}

export interface GanttViewResult {
  rows: GanttRow[]
  range: { start: string; end: string; totalDays: number }
  months: GanttMonth[]
}

export function useGanttView(
  slug: string | undefined,
  params: {
    startField: string
    endField?: string
    filters?: Record<string, string>
  },
) {
  const search = new URLSearchParams()
  search.set('start_field', params.startField)
  if (params.endField) search.set('end_field', params.endField)
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value) search.set(key, value)
    }
  }

  return useQuery({
    queryKey: [...queryKeys.entries.all, slug, 'gantt', params],
    queryFn: () =>
      api.get<GanttViewResult>(`/data/${slug}/gantt?${search.toString()}`),
    enabled: !!slug && !!params.startField,
    staleTime: 30_000,
  })
}

export interface KanbanColumn {
  value: string
  label: string
  color?: string
  entries: Record<string, unknown>[]
}

export interface KanbanViewResult {
  columns: KanbanColumn[]
  allowed_moves?: Record<string, string[]>
}

export function useKanbanView(
  slug: string | undefined,
  params: {
    groupField: string
    filters?: Record<string, string>
  },
) {
  const search = new URLSearchParams()
  search.set('group_field', params.groupField)
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value) search.set(key, value)
    }
  }

  return useQuery({
    queryKey: [...queryKeys.entries.all, slug, 'kanban', params],
    queryFn: () =>
      api.get<KanbanViewResult>(`/data/${slug}/kanban?${search.toString()}`),
    enabled: !!slug && !!params.groupField,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Global Calendar (cross-collection)
// ---------------------------------------------------------------------------

export interface GlobalCalendarEvent {
  id: string
  label: string
  date: string
  endDate?: string
  collectionId: string
  collectionLabel: string
  collectionSlug: string
  collectionIcon?: string
}

export function useGlobalCalendarEvents(year: number, month: number) {
  return useQuery({
    queryKey: ['globalCalendar', year, month],
    queryFn: () =>
      api.get<GlobalCalendarEvent[]>(
        `/calendar/events?year=${year}&month=${month}`,
      ),
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Relationship Graph
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string
  label: string
  icon?: string
  fieldCount: number
}

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  label: string
  relationType: string
}

export interface RelationshipGraphResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export function useRelationshipGraphAPI() {
  return useQuery({
    queryKey: ['relationshipGraph'],
    queryFn: () => api.get<RelationshipGraphResult>('/schema/relationship-graph'),
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Available Transitions
// ---------------------------------------------------------------------------

export interface AvailableTransition {
  id: string
  label: string
  to_status: string
  to_color: string
  allowed_user_names?: string[]
}

export interface TransitionsResult {
  transitions: AvailableTransition[]
  allowed_moves: Record<string, string[]>
}

export function useAvailableTransitions(
  collectionId: string | undefined,
  status?: string,
) {
  const search = new URLSearchParams()
  if (status) search.set('status', status)
  const qs = search.toString()

  return useQuery({
    queryKey: ['transitions', collectionId, status],
    queryFn: () =>
      api.get<TransitionsResult>(
        `/schema/collections/${collectionId}/process/transitions${qs ? `?${qs}` : ''}`,
      ),
    enabled: !!collectionId,
    staleTime: 30_000,
  })
}
