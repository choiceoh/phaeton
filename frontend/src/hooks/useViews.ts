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
  return useMutation({
    mutationFn: (body: CreateViewReq) =>
      api.post<View>(`/schema/collections/${collectionId}/views`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.views.list(collectionId) })
    },
  })
}

export function useUpdateView(collectionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateViewReq }) =>
      api.patch<View>(`/schema/views/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.views.list(collectionId) })
    },
  })
}

export function useDeleteView(collectionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<{ status: string }>(`/schema/views/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.views.list(collectionId) })
    },
  })
}
