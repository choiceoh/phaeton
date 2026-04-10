import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/lib/queryKeys'
import { useCurrentUser } from '@/hooks/useAuth'
import { toast } from 'sonner'

interface SSEMessage {
  type: string
  collection_id: string
  collection_slug?: string
  record_id?: string
  actor_user_id?: string
  actor_name?: string
}

const EVENT_LABELS: Record<string, string> = {
  record_created: '새 레코드를 추가했습니다',
  record_updated: '레코드를 수정했습니다',
  record_deleted: '레코드를 삭제했습니다',
  comment: '댓글을 남겼습니다',
}

/**
 * Connects to the SSE endpoint and invalidates relevant queries
 * when real-time events arrive. Automatically reconnects on disconnect.
 *
 * - Targeted invalidation: uses collection_slug to scope refetch
 * - Self-event filtering: skips refetch when the current user is the actor
 * - Toast: notifies when another user modifies data
 */
export function useSSE() {
  const qc = useQueryClient()
  const { data: me } = useCurrentUser()
  const meRef = useRef(me)
  meRef.current = me

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

        const isSelf = meRef.current?.id === msg.actor_user_id

        // Always refresh notifications (even for self — server may
        // generate notifications from automations).
        qc.invalidateQueries({ queryKey: queryKeys.notifications.all })

        // Skip data refetch for own actions — optimistic updates already applied.
        if (isSelf) return

        const slug = msg.collection_slug

        if (slug) {
          // Targeted invalidation: only the affected collection's entries.
          qc.invalidateQueries({
            queryKey: [...queryKeys.entries.all, slug],
          })
        }

        if (msg.type === 'comment' && slug && msg.record_id) {
          qc.invalidateQueries({
            queryKey: queryKeys.comments.list(slug, msg.record_id),
          })
        }

        // Toast for other users' changes.
        const label = EVENT_LABELS[msg.type]
        if (label && msg.actor_name) {
          toast(`${msg.actor_name}님이 ${label}`, {
            duration: 3000,
          })
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
