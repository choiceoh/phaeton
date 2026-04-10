import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/lib/queryKeys'

interface SSEMessage {
  type: string
  collection_id: string
  record_id?: string
  actor_user_id?: string
  actor_name?: string
}

/**
 * Connects to the SSE endpoint and invalidates relevant queries
 * when real-time events arrive. Automatically reconnects on disconnect.
 */
export function useSSE() {
  const qc = useQueryClient()
  const retryDelay = useRef(1000)

  useEffect(() => {
    let es: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    function connect() {
      if (unmounted) return
      es = new EventSource('/api/events', { withCredentials: true })

      es.addEventListener('connected', () => {
        retryDelay.current = 1000
      })

      es.addEventListener('message', (e) => {
        let msg: SSEMessage
        try {
          msg = JSON.parse(e.data)
        } catch {
          return
        }

        // Always refresh notifications
        qc.invalidateQueries({ queryKey: queryKeys.notifications.all })

        // Refresh entries & comments for the affected collection.
        // We invalidate broadly because SSE sends collection_id (UUID)
        // while entry queries use slug — React Query only refetches active queries.
        if (msg.collection_id) {
          qc.invalidateQueries({ queryKey: queryKeys.entries.all })
          qc.invalidateQueries({ queryKey: queryKeys.comments.all })
        }
      })

      es.onerror = () => {
        es?.close()
        if (unmounted) return
        // Exponential backoff up to 30s
        timer = setTimeout(connect, retryDelay.current)
        retryDelay.current = Math.min(retryDelay.current * 2, 30000)
      }
    }

    connect()

    return () => {
      unmounted = true
      es?.close()
      if (timer) clearTimeout(timer)
    }
  }, [qc])
}
