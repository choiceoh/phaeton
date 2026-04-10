import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { CreateSavedViewReq, SavedView, UpdateSavedViewReq } from '@/lib/types'

export function useSavedViews(collectionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.savedViews.list(collectionId ?? ''),
    queryFn: () => api.get<SavedView[]>(`/schema/collections/${collectionId}/saved-views`),
    enabled: !!collectionId,
  })
}

export function useCreateSavedView(collectionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSavedViewReq) =>
      api.post<SavedView>(`/schema/collections/${collectionId}/saved-views`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedViews.list(collectionId) })
    },
  })
}

export function useUpdateSavedView(collectionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSavedViewReq }) =>
      api.patch<SavedView>(`/schema/saved-views/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedViews.list(collectionId) })
    },
  })
}

export function useDeleteSavedView(collectionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<{ status: string }>(`/schema/saved-views/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.savedViews.list(collectionId) })
    },
  })
}
