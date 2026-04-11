/**
 * Debounced batch save hook for cell edits.
 *
 * Accumulates individual cell edits into a buffer, then flushes them
 * as a single batch PATCH request after a debounce period (default 2s).
 * This replaces per-cell API calls with one batched request.
 *
 * In local mode, the bulk cache is updated optimistically on each edit.
 * The network call is deferred until the debounce timer fires.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useBatchUpdateEntry } from '@/hooks/useEntries'
import type { EntryListResult } from '@/hooks/useEntries'
import { queryKeys } from '@/lib/queryKeys'
import type { EntryRow } from '@/lib/types'

interface PendingEdit {
  id: string
  fields: Record<string, unknown>
}

interface UseDebouncedBatchSaveOptions {
  debounceMs?: number
  isLocalMode?: boolean
}

export function useDebouncedBatchSave(
  slug: string,
  options: UseDebouncedBatchSaveOptions = {},
) {
  const { debounceMs = 2000, isLocalMode = false } = options
  const qc = useQueryClient()
  const batchUpdate = useBatchUpdateEntry(slug)

  // Pending edits buffer: rowId → merged fields
  const pendingRef = useRef<Map<string, PendingEdit>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushingRef = useRef(false)
  const slugRef = useRef(slug)
  slugRef.current = slug
  const isLocalModeRef = useRef(isLocalMode)
  isLocalModeRef.current = isLocalMode

  const flush = useCallback(async () => {
    if (pendingRef.current.size === 0 || flushingRef.current) return
    flushingRef.current = true

    const updates = Array.from(pendingRef.current.values())
    pendingRef.current.clear()

    try {
      await batchUpdate.mutateAsync(updates)
    } catch {
      toast.error('일괄 저장 실패')
    } finally {
      flushingRef.current = false
    }
  }, [batchUpdate])

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      flush()
    }, debounceMs)
  }, [debounceMs, flush])

  const queueEdit = useCallback(
    (rowId: string, fieldSlug: string, value: unknown) => {
      // Merge into pending buffer
      const existing = pendingRef.current.get(rowId)
      if (existing) {
        existing.fields[fieldSlug] = value
      } else {
        pendingRef.current.set(rowId, { id: rowId, fields: { [fieldSlug]: value } })
      }

      // Optimistic update for local mode bulk cache
      if (isLocalModeRef.current) {
        const bulkKey = queryKeys.entries.bulk(slugRef.current)
        qc.setQueryData<EntryListResult>(bulkKey, (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.map((row: EntryRow) =>
              row.id === rowId ? { ...row, [fieldSlug]: value } : row,
            ),
          }
        })
      }

      scheduleFlush()
    },
    [qc, scheduleFlush],
  )

  // Flush on unmount and beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingRef.current.size > 0) {
        const updates = Array.from(pendingRef.current.values())
        pendingRef.current.clear()
        // Use sendBeacon for reliability on page unload
        const body = JSON.stringify({ updates })
        navigator.sendBeacon(`/api/data/${slugRef.current}/batch`, body)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (timerRef.current) clearTimeout(timerRef.current)
      // Flush synchronously on unmount
      if (pendingRef.current.size > 0) {
        const updates = Array.from(pendingRef.current.values())
        pendingRef.current.clear()
        batchUpdate.mutate(updates)
      }
    }
  }, [batchUpdate])

  return {
    queueEdit,
    flush,
    pendingCount: pendingRef.current.size,
    isFlushing: flushingRef.current,
  }
}
