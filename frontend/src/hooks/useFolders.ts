import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Folder } from '@/lib/types'

/** Fetch all folders. */
export function useFolders() {
  return useQuery({
    queryKey: queryKeys.folders.list(),
    queryFn: () => api.get<Folder[]>('/schema/folders'),
  })
}

/** Create a new folder. */
export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { label: string; slug: string; icon?: string; parent_id?: string }) =>
      api.post<Folder>('/schema/folders', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.all })
    },
  })
}

/** Update a folder. */
export function useUpdateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; label?: string; icon?: string; sort_order?: number }) =>
      api.patch<Folder>(`/schema/folders/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.all })
    },
  })
}

/** Delete a folder. Workbooks in it become uncategorized. */
export function useDeleteFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del(`/schema/folders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders.all })
      qc.invalidateQueries({ queryKey: queryKeys.workbooks.all })
    },
  })
}
