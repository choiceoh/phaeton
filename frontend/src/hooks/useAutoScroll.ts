/**
 * useAutoScroll — Auto-scroll container when cursor is near edges during drag.
 *
 * Used by drag-to-select, fill handle, and cell drag move/copy to scroll
 * the grid container when the mouse approaches viewport edges.
 */
import { useCallback, useRef } from 'react'

const EDGE_ZONE = 40 // pixels from edge to trigger scrolling
const MAX_SPEED = 16 // max pixels per frame

export function useAutoScroll(containerRef: React.RefObject<HTMLElement | null>) {
  const frameRef = useRef<number>(0)
  const speedRef = useRef({ dx: 0, dy: 0 })

  const tick = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const { dx, dy } = speedRef.current
    if (dx === 0 && dy === 0) return
    el.scrollLeft += dx
    el.scrollTop += dy
    frameRef.current = requestAnimationFrame(tick)
  }, [containerRef])

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      let dx = 0
      let dy = 0

      // Horizontal
      if (clientX < rect.left + EDGE_ZONE && el.scrollLeft > 0) {
        const ratio = 1 - (clientX - rect.left) / EDGE_ZONE
        dx = -Math.round(Math.max(1, ratio * MAX_SPEED))
      } else if (clientX > rect.right - EDGE_ZONE && el.scrollLeft + el.clientWidth < el.scrollWidth) {
        const ratio = 1 - (rect.right - clientX) / EDGE_ZONE
        dx = Math.round(Math.max(1, ratio * MAX_SPEED))
      }

      // Vertical
      if (clientY < rect.top + EDGE_ZONE && el.scrollTop > 0) {
        const ratio = 1 - (clientY - rect.top) / EDGE_ZONE
        dy = -Math.round(Math.max(1, ratio * MAX_SPEED))
      } else if (clientY > rect.bottom - EDGE_ZONE && el.scrollTop + el.clientHeight < el.scrollHeight) {
        const ratio = 1 - (rect.bottom - clientY) / EDGE_ZONE
        dy = Math.round(Math.max(1, ratio * MAX_SPEED))
      }

      const wasStopped = speedRef.current.dx === 0 && speedRef.current.dy === 0
      speedRef.current = { dx, dy }

      // Start animation loop if we were stopped and now have speed
      if (wasStopped && (dx !== 0 || dy !== 0)) {
        frameRef.current = requestAnimationFrame(tick)
      }
    },
    [containerRef, tick],
  )

  const stop = useCallback(() => {
    speedRef.current = { dx: 0, dy: 0 }
    cancelAnimationFrame(frameRef.current)
  }, [])

  return { update, stop }
}
