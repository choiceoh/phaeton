import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { CreateViewReq, UpdateViewReq, View } from '@/lib/types'

export function useViews(collectionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.views.list(collectionId ?? ''),
    queryFn: () => api.get<View[]>(`/schema/collections/${collectionId}/views`),
    enabled: !!collectionId,
  })
}

export function useCreateView(collectionId: string) {
  const qc = useQueryClient()
  const key = queryKeys.views.list(collectionId)
  return useMutation({
    mutationFn: (body: CreateViewReq) =>
      api.post<View>(`/schema/collections/${collectionId}/views`, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<View[]>(key)
      qc.setQueryData<View[]>(key, (old) => [
        ...(old ?? []),
        { id: `_optimistic_${Date.now()}`, collection_id: collectionId, ...body } as View,
      ])
      return { prev }
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useUpdateView(collectionId: string) {
  const qc = useQueryClient()
  const key = queryKeys.views.list(collectionId)
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateViewReq }) =>
      api.patch<View>(`/schema/views/${id}`, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<View[]>(key)
      qc.setQueryData<View[]>(key, (old) =>
        (old ?? []).map((v) => (v.id === id ? { ...v, ...body } : v)),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })
}

export function useDeleteView(collectionId: string) {
  const qc = useQueryClient()
  const key = queryKeys.views.list(collectionId)
  return useMutation({
    mutationFn: (id: string) => api.del<{ status: string }>(`/schema/views/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<View[]>(key)
      qc.setQueryData<View[]>(key, (old) =>
        (old ?? []).filter((v) => v.id !== id),
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })
}
