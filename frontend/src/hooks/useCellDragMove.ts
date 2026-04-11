/**
 * useCellDragMove — Drag cells to move or copy (Ctrl+drag).
 *
 * Detects mouse near the border of the active cell/selection (excluding the
 * fill-handle corner), changes cursor to 'move', and on drag:
 * - Move: clears source cells and writes values to target
 * - Copy (Ctrl held): writes values to target without clearing source
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CellPosition, SelectionRange } from './useGridNavigation'
import type { Field } from '@/lib/types'
import { isComputedType, isLayoutType } from '@/lib/constants'

interface UseCellDragMoveOptions {
  activeCell: CellPosition | null
  selection: SelectionRange | null
  data: Record<string, unknown>[]
  columnIds: string[]
  fields: Field[]
  readOnlyColumns: Set<string>
  onMove: (updates: { id: string; fields: Record<string, unknown> }[]) => void
  onAutoScroll?: (x: number, y: number) => void
  onAutoScrollStop?: () => void
}

export interface DragGhostRange {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  mode: 'move' | 'copy'
}

const EDGE_THRESHOLD = 4 // pixels from cell border
const FILL_HANDLE_SIZE = 8 // pixels from bottom-right corner (avoid fill handle)

function getSourceRange(activeCell: CellPosition | null, selection: SelectionRange | null) {
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

/**
 * Check if the mouse position is near the border of the given cell element,
 * but NOT in the fill-handle corner (bottom-right).
 */
function isNearBorder(el: HTMLElement, clientX: number, clientY: number): boolean {
  const rect = el.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const w = rect.width
  const h = rect.height

  // Exclude the fill-handle corner (bottom-right area)
  if (x >= w - FILL_HANDLE_SIZE && y >= h - FILL_HANDLE_SIZE) return false

  // Check if near any border
  return x < EDGE_THRESHOLD || x > w - EDGE_THRESHOLD || y < EDGE_THRESHOLD || y > h - EDGE_THRESHOLD
}

export function useCellDragMove({
  activeCell,
  selection,
  data,
  columnIds,
  fields,
  readOnlyColumns,
  onMove,
  onAutoScroll,
  onAutoScrollStop,
}: UseCellDragMoveOptions) {
  const [dragGhost, setDragGhost] = useState<DragGhostRange | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const didDragRef = useRef(false)
  const dragStateRef = useRef<{
    sourceRange: ReturnType<typeof getSourceRange>
    startClientX: number
    startClientY: number
    startRow: number
    startCol: number
  } | null>(null)

  const sourceRange = getSourceRange(activeCell, selection)

  // Check if a cell is part of the active cell or selection
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

      const cell = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null
      if (!cell) return

      if (isNearBorder(cell, e.clientX, e.clientY)) {
        cell.style.cursor = e.ctrlKey || e.metaKey ? 'copy' : 'move'
      } else {
        cell.style.cursor = ''
      }
    },
    [isDragging, isCellInSource],
  )

  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      if (!isCellInSource(row, col) || !sourceRange) return

      const cell = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null
      if (!cell) return

      // Only start drag if near border
      if (!isNearBorder(cell, e.clientX, e.clientY)) return

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

        // Only start visual drag after moving a minimum distance
        const dx = ev.clientX - dragStateRef.current.startClientX
        const dy = ev.clientY - dragStateRef.current.startClientY
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && !isDragging) return

        setIsDragging(true)
        didDragRef.current = true
        onAutoScroll?.(ev.clientX, ev.clientY)

        // Find the cell under cursor
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        if (!el) return
        const targetCell = (el as HTMLElement).closest('[data-row]') as HTMLElement | null
        if (!targetCell) return

        const targetRow = parseInt(targetCell.dataset.row ?? '', 10)
        const targetCol = parseInt(targetCell.dataset.col ?? '', 10)
        if (isNaN(targetRow) || isNaN(targetCol)) return

        const src = dragStateRef.current.sourceRange!
        const rowOffset = targetRow - dragStateRef.current.startRow
        const colOffset = targetCol - dragStateRef.current.startCol
        const mode = (ev.ctrlKey || ev.metaKey) ? 'copy' as const : 'move' as const

        setDragGhost({
          startRow: src.startRow + rowOffset,
          endRow: src.endRow + rowOffset,
          startCol: src.startCol + colOffset,
          endCol: src.endCol + colOffset,
          mode,
        })
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        onAutoScrollStop?.()

        setIsDragging(false)

        // Execute the move/copy using the latest ghost state
        setTimeout(() => {
          setDragGhost((currentGhost) => {
            if (!currentGhost || !dragStateRef.current?.sourceRange) {
              dragStateRef.current = null
              return null
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

            if (updates.length > 0) {
              onMove(updates)
            }

            dragStateRef.current = null
            return null
          })
        }, 0)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [sourceRange, isCellInSource, columnIds, readOnlyColumns, fields, data, onMove],
  )

  // Reset on active cell change
  useEffect(() => {
    setDragGhost(null)
    setIsDragging(false)
    didDragRef.current = false
  }, [activeCell?.row, activeCell?.col])

  return {
    dragGhost,
    isDragging,
    didDragRef,
    handleCellMouseMove,
    handleCellMouseDown,
  }
}
