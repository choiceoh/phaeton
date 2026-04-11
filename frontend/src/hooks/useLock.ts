import { useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Workbook } from '@/lib/types'
import { useCurrentUser } from '@/hooks/useAuth'

interface LockStatus {
  locked_by?: string
  locked_at?: string
}

/** Fetch the current lock status of a workbook. */
export function useWorkbookLockStatus(workbookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workbooks.lock(workbookId!),
    queryFn: () => api.get<LockStatus>(`/schema/workbooks/${workbookId}/lock`),
    enabled: !!workbookId,
    staleTime: 10_000,
  })
}

/** Acquire / release workbook lock + auto-lock on mount, auto-release on unmount. */
export function useWorkbookLock(workbookId: string | undefined) {
  const qc = useQueryClient()
  const { data: me } = useCurrentUser()

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.workbooks.list() })
    if (workbookId) {
      qc.invalidateQueries({ queryKey: queryKeys.workbooks.lock(workbookId) })
    }
  }, [qc, workbookId])

  const acquireLock = useMutation({
    mutationFn: () => api.post<Workbook>(`/schema/workbooks/${workbookId}/lock`),
    onSuccess: invalidate,
  })

  const releaseLock = useMutation({
    mutationFn: () => api.del<void>(`/schema/workbooks/${workbookId}/lock`),
    onSuccess: invalidate,
  })

  // Auto-acquire on mount.
  useEffect(() => {
    if (!workbookId || !me) return
    acquireLock.mutate()

    // Release on page unload.
    const handleUnload = () => {
      navigator.sendBeacon(`/api/schema/workbooks/${workbookId}/lock?_method=DELETE`)
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      releaseLock.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbookId, me?.id])

  const { data: lockStatus } = useWorkbookLockStatus(workbookId)
  const isLockedByOther = !!lockStatus?.locked_by && lockStatus.locked_by !== me?.id
  const isLockedByMe = !!lockStatus?.locked_by && lockStatus.locked_by === me?.id

  return {
    isLockedByOther,
    isLockedByMe,
    lockOwner: lockStatus?.locked_by,
    lockedAt: lockStatus?.locked_at,
    acquireLock,
    releaseLock,
  }
}
