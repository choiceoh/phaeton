/**
 * useCellDragMove — Drag cells to move or copy (Ctrl+drag).
 *
 * Detects mouse near the border of the active cell/selection (excluding the
 * fill-handle corner), changes cursor to 'move', and on drag:
 * - Move: clears source cells and writes values to target
 * - Copy (Ctrl held): writes values to target without clearing source
 *
 * State (dragGhost, dragMoveDragging) lives in the Zustand grid store.
 */
import { useCallback, useEffect, useRef } from 'react'

import { useGridStore, useGridStoreApi, type CellPosition } from '@/stores/grid'
import { selectActiveCell, selectSelection, selectDragGhost, selectDragMoveDragging } from '@/stores/grid/selectors'
import type { CellFormats, EntryRow, Field } from '@/lib/types'
import { isComputedType, isLayoutType } from '@/lib/constants'

// Re-export for backward compat.
export type { DragGhostRange } from '@/stores/grid'

interface UseCellDragMoveOptions {
  activeCell?: null // ignored — read from store
  selection?: null  // ignored — read from store
  data: Record<string, unknown>[]
  columnIds: string[]
  fields: Field[]
  readOnlyColumns: Set<string>
  onMove: (updates: { id: string; fields: Record<string, unknown> }[]) => void
  onAutoScroll?: (x: number, y: number) => void
  onAutoScrollStop?: () => void
  /** Canvas grid: resolve viewport coords to cell position (replaces elementFromPoint). */
  cellAtPoint?: (clientX: number, clientY: number) => CellPosition | null
  /** Canvas grid: check if point is near cell border (replaces DOM-based isNearBorder). */
  isNearBorderFn?: (clientX: number, clientY: number, row: number, col: number) => boolean
}

const EDGE_THRESHOLD = 6
const FILL_HANDLE_SIZE = 10

function getSourceRange(activeCell: { row: number; col: number } | null, selection: { startRow: number; startCol: number; endRow: number; endCol: number } | null) {
  if (selection) {
    return {
      startRow: Math.min(selection.startRow, selection.endRow),
      endRow: Math.max(selection.startRow, selection.endRow),
      startCol: Math.min(selection.startCol, selection.endCol),
      endCol: Math.max(selection.startCol, selection.endCol),
    }
  }
  if (activeCell) {
    return {
      startRow: activeCell.row,
      endRow: activeCell.row,
      startCol: activeCell.col,
      endCol: activeCell.col,
    }
  }
  return null
}

function isNearBorder(el: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = el.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const w = rect.width
  const h = rect.height

  if (x >= w - FILL_HANDLE_SIZE && y >= h - FILL_HANDLE_SIZE) return false

  return x < EDGE_THRESHOLD || x > w - EDGE_THRESHOLD || y < EDGE_THRESHOLD || y > h - EDGE_THRESHOLD
}

export function useCellDragMove({
  data,
  columnIds,
  fields,
  readOnlyColumns,
  onMove,
  onAutoScroll,
  onAutoScrollStop,
  cellAtPoint,
  isNearBorderFn,
}: UseCellDragMoveOptions) {
  // ── Store subscriptions ────────────────────────────────────────────
  const activeCell = useGridStore(selectActiveCell)
  const selection = useGridStore(selectSelection)
  const dragGhost = useGridStore(selectDragGhost)
  const isDragging = useGridStore(selectDragMoveDragging)
  const setDragGhost = useGridStore((s) => s.setDragGhost)
  const setDragMoveDragging = useGridStore((s) => s.setDragMoveDragging)
  const storeApi = useGridStoreApi()

  const didDragRef = useRef(false)
  const dragStateRef = useRef<{
    sourceRange: ReturnType<typeof getSourceRange>
    startClientX: number
    startClientY: number
    startRow: number
    startCol: number
  } | null>(null)

  const sourceRange = getSourceRange(activeCell, selection)

  const isCellInSource = useCallback(
    (row: number, col: number) => {
      if (!sourceRange) return false
      return row >= sourceRange.startRow && row <= sourceRange.endRow &&
             col >= sourceRange.startCol && col <= sourceRange.endCol
    },
    [sourceRange],
  )

  const handleCellMouseMove = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      if (isDragging || !isCellInSource(row, col)) return

      // Canvas path: use isNearBorderFn if available, else DOM fallback
      let nearBorder = false
      if (isNearBorderFn) {
        nearBorder = isNearBorderFn(e.clientX, e.clientY, row, col)
      } else {
        const cell = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null
        if (!cell) return
        nearBorder = isNearBorder(cell, e.clientX, e.clientY)
      }

      // For Canvas mode, cursor is set on the container; for DOM, set on the cell
      const el = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null
      const target = el ?? e.currentTarget as HTMLElement
      if (nearBorder) {
        target.style.cursor = e.ctrlKey || e.metaKey ? 'copy' : 'move'
      } else {
        target.style.cursor = ''
      }
    },
    [isDragging, isCellInSource, isNearBorderFn, cellAtPoint],
  )

  const updateDragGhost = useCallback(
    (clientX: number, clientY: number, ctrlKey = false) => {
      if (!dragStateRef.current) return

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
        const targetCell = (el as HTMLElement).closest('[data-row]') as HTMLElement | null
        if (!targetCell) return
        targetRow = parseInt(targetCell.dataset.row ?? '', 10)
        targetCol = parseInt(targetCell.dataset.col ?? '', 10)
        if (isNaN(targetRow) || isNaN(targetCol)) return
      }

      const src = dragStateRef.current.sourceRange!
      const rowOffset = targetRow - dragStateRef.current.startRow
      const colOffset = targetCol - dragStateRef.current.startCol
      const mode = ctrlKey ? 'copy' as const : 'move' as const

      setDragGhost({
        startRow: src.startRow + rowOffset,
        endRow: src.endRow + rowOffset,
        startCol: src.startCol + colOffset,
        endCol: src.endCol + colOffset,
        mode,
      })
    },
    [setDragGhost, cellAtPoint],
  )

  const updateDragGhostRef = useRef(updateDragGhost)
  updateDragGhostRef.current = updateDragGhost

  const lastCtrlRef = useRef(false)

  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      if (!isCellInSource(row, col) || !sourceRange) return

      // Canvas path: use isNearBorderFn if available, else DOM fallback
      let nearBorder = false
      if (isNearBorderFn) {
        nearBorder = isNearBorderFn(e.clientX, e.clientY, row, col)
      } else {
        const cell = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null
        if (!cell) return
        nearBorder = isNearBorder(cell, e.clientX, e.clientY)
      }

      // Only start drag if near border
      if (!nearBorder) return

      e.preventDefault()
      e.stopPropagation()

      didDragRef.current = false
      dragStateRef.current = {
        sourceRange,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startRow: row,
        startCol: col,
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragStateRef.current) return

        const dx = ev.clientX - dragStateRef.current.startClientX
        const dy = ev.clientY - dragStateRef.current.startClientY
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && !isDragging) return

        setDragMoveDragging(true)
        didDragRef.current = true
        lastCtrlRef.current = ev.ctrlKey || ev.metaKey

        // Apply drag cursor class based on copy/move mode
        document.body.classList.remove('grid-drag-move', 'grid-drag-copy')
        document.body.classList.add(lastCtrlRef.current ? 'grid-drag-copy' : 'grid-drag-move')

        onAutoScroll?.(ev.clientX, ev.clientY)
        updateDragGhostRef.current(ev.clientX, ev.clientY, ev.ctrlKey || ev.metaKey)
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.classList.remove('grid-drag-move', 'grid-drag-copy')
        onAutoScrollStop?.()

        setDragMoveDragging(false)

        setTimeout(() => {
          const currentGhost = storeApi.getState().dragGhost
          if (!currentGhost || !dragStateRef.current?.sourceRange) {
            setDragGhost(null)
            dragStateRef.current = null
            return
          }

          const src = dragStateRef.current.sourceRange
          const isCopy = currentGhost.mode === 'copy'
          const updates: { id: string; fields: Record<string, unknown> }[] = []

          // Read all source values first
          const sourceValues: Record<string, unknown>[][] = []
          for (let r = src.startRow; r <= src.endRow; r++) {
            const rowVals: Record<string, unknown> = {}
            for (let c = src.startCol; c <= src.endCol; c++) {
              const colId = columnIds[c]
              if (colId && data[r]) rowVals[colId] = data[r][colId]
            }
            sourceValues.push([rowVals])
          }

          // Clear source cells (for move, not copy)
          if (!isCopy) {
            for (let r = src.startRow; r <= src.endRow; r++) {
              const row = data[r]
              if (!row) continue
              const rowId = String(row.id)
              const clearFields: Record<string, unknown> = {}
              for (let c = src.startCol; c <= src.endCol; c++) {
                const colId = columnIds[c]
                if (!colId || readOnlyColumns.has(colId)) continue
                const field = fields.find((f) => f.slug === colId)
                if (!field || isComputedType(field.field_type) || isLayoutType(field.field_type)) continue
                clearFields[colId] = null
              }
              if (Object.keys(clearFields).length > 0) {
                let update = updates.find((u) => u.id === rowId)
                if (!update) {
                  update = { id: rowId, fields: {} }
                  updates.push(update)
                }
                Object.assign(update.fields, clearFields)
              }
            }
          }

          // Write to target cells
          const rowOffset = currentGhost.startRow - src.startRow
          const colOffset = currentGhost.startCol - src.startCol
          for (let r = src.startRow; r <= src.endRow; r++) {
            const targetRowIdx = r + rowOffset
            const targetRow = data[targetRowIdx]
            if (!targetRow) continue
            const rowId = String(targetRow.id)
            const writeFields: Record<string, unknown> = {}

            for (let c = src.startCol; c <= src.endCol; c++) {
              const srcColId = columnIds[c]
              const targetColIdx = c + colOffset
              const targetColId = columnIds[targetColIdx]
              if (!srcColId || !targetColId || readOnlyColumns.has(targetColId)) continue
              const field = fields.find((f) => f.slug === targetColId)
              if (!field || isComputedType(field.field_type) || isLayoutType(field.field_type)) continue
              writeFields[targetColId] = data[r]?.[srcColId]
            }

            if (Object.keys(writeFields).length > 0) {
              let update = updates.find((u) => u.id === rowId)
              if (!update) {
                update = { id: rowId, fields: {} }
                updates.push(update)
              }
              Object.assign(update.fields, writeFields)
            }
          }

          // Move/copy cell formats along with values.
          if (updates.length > 0) {
            if (!isCopy) {
              for (let r = src.startRow; r <= src.endRow; r++) {
                const srcRow = data[r] as EntryRow | undefined
                if (!srcRow?._cell_formats) continue
                const update = updates.find((u) => u.id === String(srcRow.id))
                if (!update) continue
                const existing: CellFormats = { ...(srcRow._cell_formats ?? {}) }
                let changed = false
                for (let c = src.startCol; c <= src.endCol; c++) {
                  const colId = columnIds[c]
                  if (colId && existing[colId]) {
                    delete existing[colId]
                    changed = true
                  }
                }
                if (changed) update.fields._cell_formats = existing
              }
            }
            const rowOff = currentGhost.startRow - src.startRow
            const colOff = currentGhost.startCol - src.startCol
            for (let r = src.startRow; r <= src.endRow; r++) {
              const srcRow = data[r] as EntryRow | undefined
              const targetRowIdx = r + rowOff
              const targetRow = data[targetRowIdx] as EntryRow | undefined
              if (!targetRow) continue
              const update = updates.find((u) => u.id === String(targetRow.id))
              if (!update) continue
              const existing: CellFormats = update.fields._cell_formats
                ? (update.fields._cell_formats as CellFormats)
                : { ...(targetRow._cell_formats ?? {}) }
              let changed = false
              for (let c = src.startCol; c <= src.endCol; c++) {
                const srcColId = columnIds[c]
                const targetColId = columnIds[c + colOff]
                if (!srcColId || !targetColId) continue
                const srcFmt = srcRow?._cell_formats?.[srcColId]
                if (srcFmt) {
                  existing[targetColId] = { ...srcFmt }
                  changed = true
                } else if (existing[targetColId]) {
                  delete existing[targetColId]
                  changed = true
                }
              }
              if (changed) update.fields._cell_formats = existing
            }
            onMove(updates)
          }

          setDragGhost(null)
          dragStateRef.current = null
        }, 0)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [sourceRange, isCellInSource, columnIds, readOnlyColumns, fields, data, onMove, isDragging, setDragMoveDragging, setDragGhost, onAutoScroll, onAutoScrollStop, storeApi],
  )

  // Reset on active cell change
  useEffect(() => {
    setDragGhost(null)
    setDragMoveDragging(false)
    didDragRef.current = false
  }, [activeCell?.row, activeCell?.col, setDragGhost, setDragMoveDragging])

  return {
    dragGhost,
    isDragging,
    didDragRef,
    handleCellMouseMove,
    handleCellMouseDown,
    updateDragGhost,
    lastCtrlRef,
  }
}
