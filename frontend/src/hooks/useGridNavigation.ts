/**
 * useGridNavigation — Keyboard & mouse navigation for spreadsheet grids.
 *
 * State (activeCell, selection) lives in the Zustand grid store.
 * This hook is a thin wrapper that wires DOM event handlers to store actions
 * and keeps non-reactive refs (anchor, drag-select) locally.
 */
import { useCallback, useEffect, useRef } from 'react'

import { useGridStore } from '@/stores/grid'
import { selectActiveCell, selectSelection } from '@/stores/grid/selectors'

// Re-export types from canonical source for backward compat.
export type { CellPosition, SelectionRange } from '@/stores/grid'
export { normalize, isCellInRange } from '@/stores/grid'

import type { CellPosition } from '@/stores/grid'

/** Check if a key represents a printable character (triggers edit mode). */
function isPrintableKey(e: React.KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  return e.key.length === 1
}

interface UseGridNavigationOptions {
  rowCount: number
  colCount: number
  /** Column indices that should be skipped during navigation (e.g. _actions) */
  skipColumns?: number[]
  /** When true, arrow/tab/enter keys are suppressed (editing mode). */
  isEditing?: boolean
  /** Called when a printable key is pressed on an active cell (to start editing). */
  onStartEditing?: (row: number, col: number, key: string) => void
  /** Called when Delete/Backspace is pressed on an active cell. */
  onClearCell?: (row: number, col: number) => void
  /** Returns cell value at (row, col) for Ctrl+Arrow jump navigation. */
  getData?: (row: number, col: number) => unknown
  /** Number of visible rows for PageUp/PageDown navigation. */
  pageSize?: number
  /** Canvas grid: resolve viewport coords to cell position (replaces elementFromPoint). */
  cellAtPoint?: (clientX: number, clientY: number) => CellPosition | null
}

/**
 * Find the jump target for Ctrl+Arrow navigation (Excel behavior).
 */
function findJumpTarget(
  row: number,
  col: number,
  dRow: number,
  dCol: number,
  getData: (r: number, c: number) => unknown,
  rowCount: number,
  colCount: number,
): { row: number; col: number } {
  const isEmpty = (r: number, c: number) => {
    const v = getData(r, c)
    return v === null || v === undefined || v === ''
  }
  const inBounds = (r: number, c: number) =>
    r >= 0 && r < rowCount && c >= 0 && c < colCount

  let r = row + dRow
  let c = col + dCol

  if (!inBounds(r, c)) return { row, col }

  if (isEmpty(row, col)) {
    while (inBounds(r, c) && isEmpty(r, c)) {
      r += dRow
      c += dCol
    }
    if (!inBounds(r, c)) {
      return { row: Math.max(0, Math.min(r - dRow, rowCount - 1)), col: Math.max(0, Math.min(c - dCol, colCount - 1)) }
    }
    return { row: r, col: c }
  } else {
    if (isEmpty(r, c)) {
      while (inBounds(r, c) && isEmpty(r, c)) {
        r += dRow
        c += dCol
      }
      if (!inBounds(r, c)) {
        return { row: Math.max(0, Math.min(r - dRow, rowCount - 1)), col: Math.max(0, Math.min(c - dCol, colCount - 1)) }
      }
      return { row: r, col: c }
    } else {
      while (inBounds(r + dRow, c + dCol) && !isEmpty(r + dRow, c + dCol)) {
        r += dRow
        c += dCol
      }
      return { row: r, col: c }
    }
  }
}

export function useGridNavigation({
  rowCount,
  colCount,
  skipColumns = [],
  isEditing = false,
  onStartEditing,
  onClearCell,
  getData,
  pageSize = 20,
  cellAtPoint,
}: UseGridNavigationOptions) {
  // ── Store subscriptions (fine-grained selectors) ───────────────────
  const activeCell = useGridStore(selectActiveCell)
  const selection = useGridStore(selectSelection)
  const setActiveCell = useGridStore((s) => s.setActiveCell)
  const setSelection = useGridStore((s) => s.setSelection)

  const containerRef = useRef<HTMLDivElement>(null)

  // Anchor for shift-extend selection.
  const anchorRef = useRef<{ row: number; col: number } | null>(null)

  // Drag-to-select state.
  const dragSelectRef = useRef<{
    anchor: { row: number; col: number }
    startClientX: number
    startClientY: number
    started: boolean
  } | null>(null)
  const didDragSelectRef = useRef(false)

  // RAF batching for drag selection (prevents jank on high-refresh displays).
  const dragRafRef = useRef(0)
  const lastDragMouseRef = useRef({ x: 0, y: 0 })

  const clampRow = useCallback((r: number) => Math.max(0, Math.min(r, rowCount - 1)), [rowCount])
  const clampCol = useCallback((c: number) => Math.max(0, Math.min(c, colCount - 1)), [colCount])

  const nextCol = useCallback(
    (c: number, dir: 1 | -1): number => {
      let next = c + dir
      while (next >= 0 && next < colCount && skipColumns.includes(next)) {
        next += dir
      }
      return Math.max(0, Math.min(next, colCount - 1))
    },
    [colCount, skipColumns],
  )

  const moveTo = useCallback(
    (row: number, col: number, extend: boolean) => {
      const r = clampRow(row)
      const c = clampCol(col)
      setActiveCell({ row: r, col: c })

      if (extend) {
        const anchor = anchorRef.current ?? { row: r, col: c }
        setSelection({ startRow: anchor.row, startCol: anchor.col, endRow: r, endCol: c })
      } else {
        anchorRef.current = { row: r, col: c }
        setSelection(null)
      }
    },
    [clampRow, clampCol, setActiveCell, setSelection],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditing) return
      if (!activeCell) return

      const { row, col } = activeCell
      const shift = e.shiftKey
      const isCtrl = e.ctrlKey || e.metaKey

      // Ctrl+Arrow: jump to data boundary
      if (isCtrl && getData && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const dRow = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
        const dCol = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
        const target = findJumpTarget(row, col, dRow, dCol, getData, rowCount, colCount)
        moveTo(target.row, target.col, shift)
        return
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          moveTo(row - 1, col, shift)
          break
        case 'ArrowDown':
          e.preventDefault()
          moveTo(row + 1, col, shift)
          break
        case 'ArrowLeft':
          e.preventDefault()
          moveTo(row, nextCol(col, -1), shift)
          break
        case 'ArrowRight':
          e.preventDefault()
          moveTo(row, nextCol(col, 1), shift)
          break
        case 'Tab':
          e.preventDefault()
          if (shift) {
            moveTo(row, nextCol(col, -1), false)
          } else {
            moveTo(row, nextCol(col, 1), false)
          }
          break
        case 'Enter':
          e.preventDefault()
          moveTo(shift ? row - 1 : row + 1, col, false)
          break
        case 'Escape':
          e.preventDefault()
          setActiveCell(null)
          setSelection(null)
          break
        case 'Home':
          e.preventDefault()
          if (isCtrl) moveTo(0, 0, shift)
          else moveTo(row, 0, shift)
          break
        case 'End':
          e.preventDefault()
          if (isCtrl) moveTo(rowCount - 1, colCount - 1, shift)
          else moveTo(row, colCount - 1, shift)
          break
        case 'PageUp':
          e.preventDefault()
          moveTo(row - pageSize, col, shift)
          break
        case 'PageDown':
          e.preventDefault()
          moveTo(row + pageSize, col, shift)
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          onClearCell?.(row, col)
          break
        case 'F2':
          e.preventDefault()
          onStartEditing?.(row, col, '')
          break
        default:
          if (isPrintableKey(e) && onStartEditing) {
            e.preventDefault()
            onStartEditing(row, col, e.key)
          }
          break
      }
    },
    [activeCell, moveTo, nextCol, colCount, rowCount, isEditing, onStartEditing, onClearCell, getData, pageSize, setActiveCell, setSelection],
  )

  const handleCellClick = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      if (didDragSelectRef.current) {
        didDragSelectRef.current = false
        return
      }
      if (e.shiftKey && activeCell) {
        const anchor = anchorRef.current ?? activeCell
        setSelection({ startRow: anchor.row, startCol: anchor.col, endRow: row, endCol: col })
        setActiveCell({ row, col })
      } else {
        anchorRef.current = { row, col }
        setActiveCell({ row, col })
        setSelection(null)
      }
    },
    [activeCell, setActiveCell, setSelection],
  )

  const updateDragSelection = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragSelectRef.current?.started) return

      // Canvas path: use cellAtPoint if available, else DOM fallback
      let targetRow: number
      let targetCol: number
      const pos = cellAtPoint?.(clientX, clientY)
      if (pos) {
        targetRow = pos.row
        targetCol = pos.col
      } else {
        const el = document.elementFromPoint(clientX, clientY)
        if (!el) return
        const cell = (el as HTMLElement).closest('[data-row]') as HTMLElement | null
        if (!cell) return
        targetRow = parseInt(cell.dataset.row ?? '', 10)
        targetCol = parseInt(cell.dataset.col ?? '', 10)
        if (isNaN(targetRow) || isNaN(targetCol)) return
      }

      const anchor = dragSelectRef.current.anchor
      setSelection({
        startRow: anchor.row,
        startCol: anchor.col,
        endRow: clampRow(targetRow),
        endCol: clampCol(targetCol),
      })
      setActiveCell({ row: clampRow(targetRow), col: clampCol(targetCol) })
    },
    [clampRow, clampCol, setActiveCell, setSelection, cellAtPoint],
  )

  const handleCellMouseDown = useCallback(
    (row: number, col: number, e: React.MouseEvent, onAutoScroll?: (x: number, y: number) => void, onAutoScrollStop?: () => void) => {
      if (e.button !== 0 || e.shiftKey) return

      anchorRef.current = { row, col }
      setActiveCell({ row, col })
      setSelection(null)

      dragSelectRef.current = {
        anchor: { row, col },
        startClientX: e.clientX,
        startClientY: e.clientY,
        started: false,
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragSelectRef.current) return

        if (!dragSelectRef.current.started) {
          const dx = ev.clientX - dragSelectRef.current.startClientX
          const dy = ev.clientY - dragSelectRef.current.startClientY
          if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
          dragSelectRef.current.started = true
          didDragSelectRef.current = true
          document.body.classList.add('grid-drag-select')
        }

        // Store latest mouse position and batch via RAF (one update per frame).
        lastDragMouseRef.current = { x: ev.clientX, y: ev.clientY }
        onAutoScroll?.(ev.clientX, ev.clientY)
        if (!dragRafRef.current) {
          dragRafRef.current = requestAnimationFrame(() => {
            dragRafRef.current = 0
            const { x, y } = lastDragMouseRef.current
            updateDragSelection(x, y)
          })
        }
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = 0
        document.body.classList.remove('grid-drag-select')
        onAutoScrollStop?.()
        dragSelectRef.current = null
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [clampRow, clampCol, updateDragSelection, setActiveCell, setSelection],
  )

  /** Select an entire column (click on column header). */
  const selectColumn = useCallback(
    (col: number, extend: boolean) => {
      if (extend && anchorRef.current) {
        const anchorCol = anchorRef.current.col
        setSelection({
          startRow: 0,
          startCol: Math.min(anchorCol, col),
          endRow: rowCount - 1,
          endCol: Math.max(anchorCol, col),
        })
      } else {
        anchorRef.current = { row: 0, col }
        setSelection({ startRow: 0, startCol: col, endRow: rowCount - 1, endCol: col })
      }
      setActiveCell({ row: 0, col })
    },
    [rowCount, setActiveCell, setSelection],
  )

  /** Select an entire row (click on row number). */
  const selectRow = useCallback(
    (row: number, extend: boolean) => {
      if (extend && anchorRef.current) {
        const anchorRow = anchorRef.current.row
        setSelection({
          startRow: Math.min(anchorRow, row),
          startCol: 0,
          endRow: Math.max(anchorRow, row),
          endCol: colCount - 1,
        })
      } else {
        anchorRef.current = { row, col: 0 }
        setSelection({ startRow: row, startCol: 0, endRow: row, endCol: colCount - 1 })
      }
      setActiveCell({ row, col: 0 })
    },
    [colCount, setActiveCell, setSelection],
  )

  // Select all (Ctrl+A).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onSelectAll(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && rowCount > 0 && colCount > 0) {
        e.preventDefault()
        setSelection({ startRow: 0, startCol: 0, endRow: rowCount - 1, endCol: colCount - 1 })
      }
    }
    el.addEventListener('keydown', onSelectAll)
    return () => el.removeEventListener('keydown', onSelectAll)
  }, [rowCount, colCount, setSelection])

  return {
    activeCell,
    setActiveCell,
    selection,
    setSelection,
    containerRef,
    handleKeyDown,
    handleCellClick,
    handleCellMouseDown,
    updateDragSelection,
    didDragSelectRef,
    selectColumn,
    selectRow,
    moveTo,
  }
}
