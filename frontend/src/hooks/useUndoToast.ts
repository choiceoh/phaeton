import { useCallback, useRef } from 'react'
import { toast } from 'sonner'

interface UndoEntry {
  id: string
  toastId: string | number
  undo: () => void
  timer: ReturnType<typeof setTimeout>
}

const UNDO_DURATION = 5000

/**
 * Provides undo-able toast functionality.
 * Call `push(message, undoFn)` to show a toast with an "되돌리기" action.
 * If the user clicks undo within 5s, `undoFn` is called.
 */
export function useUndoToast() {
  const entries = useRef<Map<string, UndoEntry>>(new Map())

  const push = useCallback((message: string, undoFn: () => void) => {
    const id = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    const toastId = toast(message, {
      duration: UNDO_DURATION,
      action: {
        label: '되돌리기',
        onClick: () => {
          const entry = entries.current.get(id)
          if (entry) {
            clearTimeout(entry.timer)
            entries.current.delete(id)
            entry.undo()
          }
        },
      },
    })

    const timer = setTimeout(() => {
      entries.current.delete(id)
    }, UNDO_DURATION + 500)

    entries.current.set(id, { id, toastId, undo: undoFn, timer })
  }, [])

  return { push }
}
