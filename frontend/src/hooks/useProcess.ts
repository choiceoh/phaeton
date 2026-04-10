import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Process, SaveProcessReq } from '@/lib/types'

export function useProcess(collectionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.process.detail(collectionId ?? ''),
    queryFn: () => api.get<Process>(`/schema/collections/${collectionId}/process`),
    enabled: !!collectionId,
  })
}

export function useSaveProcess(collectionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveProcessReq) =>
      api.put<Process>(`/schema/collections/${collectionId}/process`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.process.detail(collectionId) })
      qc.invalidateQueries({ queryKey: queryKeys.collections.detail(collectionId) })
      qc.invalidateQueries({ queryKey: queryKeys.entries.all })
    },
  })
}
