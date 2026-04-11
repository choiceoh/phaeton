/**
 * useCanvasRenderer — manages canvas refs, DPR scaling, and redraw scheduling.
 *
 * Provides three canvas layers (pinned, main, overlay) and methods to
 * request redraws that are batched via requestAnimationFrame.
 */
import { useCallback, useEffect, useRef } from 'react'
import { clearTextCache } from './CellPainter'

interface CanvasRefs {
  pinned: HTMLCanvasElement | null
  main: HTMLCanvasElement | null
  overlay: HTMLCanvasElement | null
}

interface CanvasContexts {
  pinned: CanvasRenderingContext2D | null
  main: CanvasRenderingContext2D | null
  overlay: CanvasRenderingContext2D | null
}

interface UseCanvasRendererReturn {
  pinnedRef: React.RefObject<HTMLCanvasElement | null>
  mainRef: React.RefObject<HTMLCanvasElement | null>
  overlayRef: React.RefObject<HTMLCanvasElement | null>
  /** Request a full data canvas redraw on the next animation frame. */
  requestDataRedraw: () => void
  /** Request an overlay-only redraw on the next animation frame. */
  requestOverlayRedraw: () => void
  /** Get current DPR-scaled contexts (null if not mounted). */
  getContexts: () => CanvasContexts
  /** Resize all canvases to match container dimensions. */
  resizeCanvases: (width: number, height: number, pinnedWidth: number) => void
}

export function useCanvasRenderer(): UseCanvasRendererReturn {
  const pinnedRef = useRef<HTMLCanvasElement>(null)
  const mainRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const dataRedrawPending = useRef(false)
  const overlayRedrawPending = useRef(false)
  const dataRedrawCallback = useRef<(() => void) | null>(null)
  const overlayRedrawCallback = useRef<(() => void) | null>(null)
  const rafId = useRef(0)

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  // Clear text cache when DPR changes (e.g. moving window between monitors)
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = () => clearTextCache()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [dpr])

  const getContexts = useCallback((): CanvasContexts => ({
    pinned: pinnedRef.current?.getContext('2d') ?? null,
    main: mainRef.current?.getContext('2d') ?? null,
    overlay: overlayRef.current?.getContext('2d') ?? null,
  }), [])

  const resizeCanvases = useCallback((width: number, height: number, pinnedWidth: number) => {
    const resize = (canvas: HTMLCanvasElement | null, w: number, h: number) => {
      if (!canvas) return
      const cw = Math.round(w * dpr)
      const ch = Math.round(h * dpr)
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.scale(dpr, dpr)
      }
    }

    resize(pinnedRef.current, pinnedWidth, height)
    resize(mainRef.current, width, height)
    resize(overlayRef.current, width, height)
  }, [dpr])

  const runRedrawLoop = useCallback(() => {
    if (rafId.current) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0
      if (dataRedrawPending.current) {
        dataRedrawPending.current = false
        dataRedrawCallback.current?.()
      }
      if (overlayRedrawPending.current) {
        overlayRedrawPending.current = false
        overlayRedrawCallback.current?.()
      }
    })
  }, [])

  const requestDataRedraw = useCallback(() => {
    dataRedrawPending.current = true
    runRedrawLoop()
  }, [runRedrawLoop])

  const requestOverlayRedraw = useCallback(() => {
    overlayRedrawPending.current = true
    runRedrawLoop()
  }, [runRedrawLoop])

  // Cleanup RAF on unmount
  useEffect(() => () => {
    if (rafId.current) cancelAnimationFrame(rafId.current)
  }, [])

  // Expose callback setters via the refs (set by CanvasGrid)
  ;(requestDataRedraw as unknown as { _setCallback: (cb: () => void) => void })._setCallback = (cb: () => void) => {
    dataRedrawCallback.current = cb
  }
  ;(requestOverlayRedraw as unknown as { _setCallback: (cb: () => void) => void })._setCallback = (cb: () => void) => {
    overlayRedrawCallback.current = cb
  }

  return {
    pinnedRef,
    mainRef,
    overlayRef,
    requestDataRedraw,
    requestOverlayRedraw,
    getContexts,
    resizeCanvases,
  }
}

/**
 * Set the actual redraw callback for a requestRedraw function.
 * Used by CanvasGrid to wire up the painting logic.
 */
export function setRedrawCallback(requestFn: () => void, callback: () => void): void {
  const fn = requestFn as unknown as { _setCallback?: (cb: () => void) => void }
  fn._setCallback?.(callback)
}
