/**
 * useFillHandle — Drag-to-fill hook for spreadsheet cells.
 *
 * Renders a small blue square at the bottom-right of the active cell/selection.
 * Dragging it vertically or horizontally auto-fills cells with values based on field type:
 * - Text/select: repeat source values
 * - Number: detect arithmetic sequence and continue, or repeat
 * - Date: increment by day (or detected interval)
 * - Computed/layout fields: skip
 *
 * Double-clicking the fill handle auto-fills downward to match the adjacent
 * column's data extent (Excel behavior).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CellPosition, SelectionRange } from './useGridNavigation'
import type { CellFormats, EntryRow, Field } from '@/lib/types'
import { isComputedType, isLayoutType } from '@/lib/constants'

interface UseFillHandleOptions {
  activeCell: CellPosition | null
  selection: SelectionRange | null
  data: Record<string, unknown>[]
  columnIds: string[]
  fields: Field[]
  readOnlyColumns: Set<string>
  containerRef: React.RefObject<HTMLDivElement | null>
  onFill: (updates: { id: string; fields: Record<string, unknown> }[]) => void
  onAutoScroll?: (x: number, y: number) => void
  onAutoScrollStop?: () => void
}

export interface FillPreviewRange {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}

type FillDirection = 'vertical' | 'horizontal' | null

/**
 * Generate fill values for a column based on source values and field type.
 */
function generateFillValues(
  sourceValues: unknown[],
  count: number,
  fieldType: string,
): unknown[] {
  if (count === 0 || sourceValues.length === 0) return []

  const result: unknown[] = []

  if (fieldType === 'number' || fieldType === 'integer' || fieldType === 'decimal') {
    const nums = sourceValues.filter((v) => v != null && !isNaN(Number(v))).map(Number)
    if (nums.length >= 2) {
      // Detect arithmetic sequence
      const step = nums[1] - nums[0]
      const isArithmetic = nums.every((v, i) => i === 0 || Math.abs(v - nums[i - 1] - step) < 1e-10)
      if (isArithmetic) {
        let last = nums[nums.length - 1]
        for (let i = 0; i < count; i++) {
          last += step
          result.push(fieldType === 'integer' ? Math.round(last) : last)
        }
        return result
      }
    }
    // Repeat pattern
    for (let i = 0; i < count; i++) {
      result.push(sourceValues[i % sourceValues.length])
    }
    return result
  }

  if (fieldType === 'date') {
    const dates = sourceValues
      .filter((v) => v != null)
      .map((v) => new Date(String(v)))
      .filter((d) => !isNaN(d.getTime()))

    if (dates.length >= 1) {
      const stepMs = dates.length >= 2
        ? dates[1].getTime() - dates[0].getTime()
        : 24 * 60 * 60 * 1000 // 1 day default

      let last = dates[dates.length - 1].getTime()
      for (let i = 0; i < count; i++) {
        last += stepMs
        const d = new Date(last)
        result.push(d.toISOString().slice(0, 10))
      }
      return result
    }
  }

  // Default: repeat pattern
  for (let i = 0; i < count; i++) {
    result.push(sourceValues[i % sourceValues.length])
  }
  return result
}

export function useFillHandle({
  activeCell,
  selection,
  data,
  columnIds,
  fields,
  readOnlyColumns,
  containerRef,
  onFill,
  onAutoScroll,
  onAutoScrollStop,
}: UseFillHandleOptions) {
  const [fillPreview, setFillPreview] = useState<FillPreviewRange | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStateRef = useRef<{
    sourceRange: { startRow: number; endRow: number; startCol: number; endCol: number }
    direction: FillDirection
    startClientX: number
    startClientY: number
  } | null>(null)

  // Compute the source range from active cell or selection
  const sourceRange = (() => {
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
  })()

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!sourceRange) return
      e.preventDefault()
      e.stopPropagation()

      dragStateRef.current = {
        sourceRange,
        direction: null,
        startClientX: e.clientX,
        startClientY: e.clientY,
      }
      setIsDragging(true)
      document.body.style.userSelect = 'none'

      const handleMouseMove = (ev: MouseEvent) => {
        const container = containerRef.current
        if (!container || !dragStateRef.current) return

        onAutoScroll?.(ev.clientX, ev.clientY)

        // Find the cell under the cursor using data attributes
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        if (!el) return

        const cell = (el as HTMLElement).closest('[data-row]') as HTMLElement | null
        if (!cell) return

        const targetRow = parseInt(cell.dataset.row ?? '', 10)
        const targetCol = parseInt(cell.dataset.col ?? '', 10)
        if (isNaN(targetRow)) return

        const src = dragStateRef.current.sourceRange

        // Lock direction on first significant movement
        if (!dragStateRef.current.direction) {
          const dx = Math.abs(ev.clientX - dragStateRef.current.startClientX)
          const dy = Math.abs(ev.clientY - dragStateRef.current.startClientY)
          if (dx < 5 && dy < 5) return
          dragStateRef.current.direction = dy >= dx ? 'vertical' : 'horizontal'
        }

        if (dragStateRef.current.direction === 'vertical') {
          if (targetRow > src.endRow) {
            setFillPreview({
              startRow: src.endRow + 1,
              endRow: targetRow,
              startCol: src.startCol,
              endCol: src.endCol,
            })
          } else if (targetRow < src.startRow) {
            setFillPreview({
              startRow: targetRow,
              endRow: src.startRow - 1,
              startCol: src.startCol,
              endCol: src.endCol,
            })
          } else {
            setFillPreview(null)
          }
        } else if (dragStateRef.current.direction === 'horizontal' && !isNaN(targetCol)) {
          if (targetCol > src.endCol) {
            setFillPreview({
              startRow: src.startRow,
              endRow: src.endRow,
              startCol: src.endCol + 1,
              endCol: targetCol,
            })
          } else if (targetCol < src.startCol) {
            setFillPreview({
              startRow: src.startRow,
              endRow: src.endRow,
              startCol: targetCol,
              endCol: src.startCol - 1,
            })
          } else {
            setFillPreview(null)
          }
        }
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.userSelect = ''
        onAutoScrollStop?.()

        setIsDragging(false)

        // Use a micro-task to read the latest fill preview state
        setTimeout(() => {
          executeFill()
        }, 0)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [sourceRange, containerRef, onAutoScroll, onAutoScrollStop],
  )

  /** Execute fill: apply values from source range to preview range. */
  const executeFill = useCallback(() => {
    setFillPreview((currentPreview) => {
      if (!currentPreview || !dragStateRef.current) return null

      const src = dragStateRef.current.sourceRange
      const direction = dragStateRef.current.direction
      const updates: { id: string; fields: Record<string, unknown> }[] = []

      if (direction === 'vertical') {
        // Vertical fill: for each column, fill rows
        const fillCount = currentPreview.endRow - currentPreview.startRow + 1

        for (let col = src.startCol; col <= src.endCol; col++) {
          const colId = columnIds[col]
          if (!colId || readOnlyColumns.has(colId)) continue

          const field = fields.find((f) => f.slug === colId)
          if (!field || isComputedType(field.field_type) || isLayoutType(field.field_type)) continue

          const sourceVals: unknown[] = []
          for (let r = src.startRow; r <= src.endRow; r++) {
            sourceVals.push(data[r]?.[colId])
          }

          const fillVals = generateFillValues(sourceVals, fillCount, field.field_type)

          for (let i = 0; i < fillCount; i++) {
            const targetRowIdx = currentPreview.startRow + i
            const row = data[targetRowIdx]
            if (!row) continue

            const rowId = String(row.id)
            let update = updates.find((u) => u.id === rowId)
            if (!update) {
              update = { id: rowId, fields: {} }
              updates.push(update)
            }
            update.fields[colId] = fillVals[i]
          }
        }
      } else if (direction === 'horizontal') {
        // Horizontal fill: for each row, fill columns
        const fillColCount = currentPreview.endCol - currentPreview.startCol + 1

        for (let row = src.startRow; row <= src.endRow; row++) {
          const rowData = data[row]
          if (!rowData) continue
          const rowId = String(rowData.id)

          // Collect source values across columns for this row
          const sourceVals: unknown[] = []
          const sourceFieldTypes: string[] = []
          for (let c = src.startCol; c <= src.endCol; c++) {
            const colId = columnIds[c]
            if (colId) {
              sourceVals.push(rowData[colId])
              const field = fields.find((f) => f.slug === colId)
              sourceFieldTypes.push(field?.field_type ?? 'text')
            }
          }

          for (let i = 0; i < fillColCount; i++) {
            const targetCol = currentPreview.startCol + i
            const targetColId = columnIds[targetCol]
            if (!targetColId || readOnlyColumns.has(targetColId)) continue

            const targetField = fields.find((f) => f.slug === targetColId)
            if (!targetField || isComputedType(targetField.field_type) || isLayoutType(targetField.field_type)) continue

            // Repeat pattern from source values
            const val = sourceVals[i % sourceVals.length]

            let update = updates.find((u) => u.id === rowId)
            if (!update) {
              update = { id: rowId, fields: {} }
              updates.push(update)
            }
            update.fields[targetColId] = val
          }
        }
      }

      // Copy cell formats from source rows to target rows.
      if (updates.length > 0) {
        const srcRowCount = src.endRow - src.startRow + 1
        for (const update of updates) {
          const targetRow = data.find((r) => String(r.id) === update.id) as EntryRow | undefined
          if (!targetRow) continue
          const existing: CellFormats = { ...(targetRow._cell_formats ?? {}) }
          let changed = false
          for (const colId of Object.keys(update.fields)) {
            if (colId === '_cell_formats') continue
            // Find the source cell that corresponds to this target cell.
            const targetRowIdx = data.indexOf(targetRow as Record<string, unknown>)
            let srcRowIdx: number
            if (direction === 'vertical') {
              srcRowIdx = src.startRow + ((targetRowIdx - currentPreview.startRow) % srcRowCount)
            } else {
              srcRowIdx = src.startRow + (targetRowIdx - src.startRow)
            }
            const srcRow = data[srcRowIdx] as EntryRow | undefined
            const srcFmt = srcRow?._cell_formats?.[colId]
            if (srcFmt) {
              existing[colId] = { ...srcFmt }
              changed = true
            } else if (existing[colId]) {
              delete existing[colId]
              changed = true
            }
          }
          if (changed) {
            update.fields._cell_formats = existing
          }
        }
        onFill(updates)
      }

      dragStateRef.current = null
      return null
    })
  }, [columnIds, readOnlyColumns, fields, data, onFill])

  /**
   * Double-click on fill handle: auto-fill downward to match adjacent column's
   * data extent (Excel behavior).
   */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!sourceRange) return
      e.preventDefault()
      e.stopPropagation()

      // Find the left adjacent column with data to determine fill extent
      let refCol = sourceRange.startCol - 1
      // Skip system/readonly columns
      while (refCol >= 0 && readOnlyColumns.has(columnIds[refCol])) refCol--

      if (refCol < 0) {
        // Try right adjacent
        refCol = sourceRange.endCol + 1
        while (refCol < columnIds.length && readOnlyColumns.has(columnIds[refCol])) refCol++
      }

      if (refCol < 0 || refCol >= columnIds.length) return

      const refColId = columnIds[refCol]
      if (!refColId) return

      // Find the last non-empty row in the reference column starting from source end
      let lastRow = sourceRange.endRow
      for (let r = sourceRange.endRow + 1; r < data.length; r++) {
        const val = data[r]?.[refColId]
        if (val === null || val === undefined || val === '') break
        lastRow = r
      }

      if (lastRow <= sourceRange.endRow) return

      const fillCount = lastRow - sourceRange.endRow
      const updates: { id: string; fields: Record<string, unknown> }[] = []

      for (let col = sourceRange.startCol; col <= sourceRange.endCol; col++) {
        const colId = columnIds[col]
        if (!colId || readOnlyColumns.has(colId)) continue

        const field = fields.find((f) => f.slug === colId)
        if (!field || isComputedType(field.field_type) || isLayoutType(field.field_type)) continue

        const sourceVals: unknown[] = []
        for (let r = sourceRange.startRow; r <= sourceRange.endRow; r++) {
          sourceVals.push(data[r]?.[colId])
        }

        const fillVals = generateFillValues(sourceVals, fillCount, field.field_type)

        for (let i = 0; i < fillCount; i++) {
          const targetRowIdx = sourceRange.endRow + 1 + i
          const row = data[targetRowIdx]
          if (!row) continue

          const rowId = String(row.id)
          let update = updates.find((u) => u.id === rowId)
          if (!update) {
            update = { id: rowId, fields: {} }
            updates.push(update)
          }
          update.fields[colId] = fillVals[i]
        }
      }

      // Copy cell formats from source rows to filled rows (double-click auto-fill).
      if (updates.length > 0) {
        const srcRowCount = sourceRange.endRow - sourceRange.startRow + 1
        for (const update of updates) {
          const targetRow = data.find((r) => String(r.id) === update.id) as EntryRow | undefined
          if (!targetRow) continue
          const existing: CellFormats = { ...(targetRow._cell_formats ?? {}) }
          let changed = false
          for (const colId of Object.keys(update.fields)) {
            if (colId === '_cell_formats') continue
            const targetRowIdx = data.indexOf(targetRow as Record<string, unknown>)
            const srcRowIdx = sourceRange.startRow + ((targetRowIdx - sourceRange.endRow - 1) % srcRowCount)
            const srcRow = data[srcRowIdx] as EntryRow | undefined
            const srcFmt = srcRow?._cell_formats?.[colId]
            if (srcFmt) {
              existing[colId] = { ...srcFmt }
              changed = true
            } else if (existing[colId]) {
              delete existing[colId]
              changed = true
            }
          }
          if (changed) {
            update.fields._cell_formats = existing
          }
        }
        onFill(updates)
      }
    },
    [sourceRange, columnIds, readOnlyColumns, fields, data, onFill],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dragStateRef.current = null
    }
  }, [])

  // Reset fill state when active cell changes
  useEffect(() => {
    setFillPreview(null)
    setIsDragging(false)
  }, [activeCell?.row, activeCell?.col])

  return {
    fillPreview,
    isDragging,
    handleFillHandleMouseDown: handleMouseDown,
    handleFillHandleDoubleClick: handleDoubleClick,
    sourceRange,
  }
}
