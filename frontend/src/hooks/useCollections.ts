import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Collection, CreateCollectionReq, CreateFieldIn, Field } from '@/lib/types'

// --- Reads ---

export function useCollections() {
  return useQuery({
    queryKey: queryKeys.collections.list(),
    queryFn: () => api.get<Collection[]>('/schema/collections'),
  })
}

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collections.detail(id ?? ''),
    queryFn: () => api.get<Collection>(`/schema/collections/${id}`),
    enabled: !!id,
  })
}

// --- Mutations ---

export function useCreateCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCollectionReq) =>
      api.post<Collection>('/schema/collections', input),
    onSuccess: (created) => {
      // Optimistic merge: add to the list cache so the new collection appears
      // immediately without a refetch round-trip.
      qc.setQueryData<Collection[]>(queryKeys.collections.list(), (old) =>
        old ? [...old, created] : [created],
      )
      // Invalidate to pull the canonical version (includes computed fields).
      qc.invalidateQueries({ queryKey: queryKeys.collections.all })
    },
  })
}

export function useUpdateCollection(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Pick<Collection, 'label' | 'description' | 'icon' | 'sort_order' | 'process_enabled'>>) =>
      api.patch<Collection>(`/schema/collections/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.collections.detail(id) })
      qc.invalidateQueries({ queryKey: queryKeys.collections.list() })
    },
  })
}

export function useDeleteCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) =>
      api.del<{ confirmation_required?: boolean; preview?: unknown; status?: string }>(
        `/schema/collections/${id}${confirm ? '?confirm=true' : ''}`,
      ),
    onSuccess: (_data, { confirm }) => {
      if (confirm) {
        qc.invalidateQueries({ queryKey: queryKeys.collections.all })
      }
    },
  })
}

export function useAddField(collectionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ input, confirm }: { input: CreateFieldIn; confirm: boolean }) =>
      api.post<Field | { confirmation_required: boolean; preview: unknown }>(
        `/schema/collections/${collectionId}/fields${confirm ? '?confirm=true' : ''}`,
        input,
      ),
    onSuccess: (_data, { confirm }) => {
      if (confirm) {
        qc.invalidateQueries({ queryKey: queryKeys.collections.detail(collectionId) })
        qc.invalidateQueries({ queryKey: queryKeys.collections.list() })
      }
    },
  })
}

export function useDeleteField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldId, confirm }: { fieldId: string; confirm: boolean }) =>
      api.del<{ confirmation_required?: boolean; preview?: unknown }>(
        `/schema/fields/${fieldId}${confirm ? '?confirm=true' : ''}`,
      ),
    onSuccess: (_data, { confirm }) => {
      if (confirm) {
        qc.invalidateQueries({ queryKey: queryKeys.collections.all })
      }
    },
  })
}
