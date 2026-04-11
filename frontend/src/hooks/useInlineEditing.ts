/**
 * useInlineEditing — Cell editing state machine for spreadsheet-like grids.
 *
 * States: idle → editing → saving → idle
 *
 * Coordinates with useGridNavigation by consuming `activeCell` and providing
 * `isEditing` to suppress navigation keys during editing.
 */
import { useCallback, useRef, useState } from 'react'

import type { CellPosition } from '@/hooks/useGridNavigation'
import type { Field, FieldType } from '@/lib/types'

/** Field types that cannot be inline-edited. */
const READ_ONLY_TYPES: Set<FieldType> = new Set([
  'formula', 'lookup', 'rollup', 'autonumber',
  'label', 'line', 'spacer',
])

/** Field types that are not inline-editable (open dialog instead). */
const DIALOG_TYPES: Set<FieldType> = new Set([
  'file', 'table', 'spreadsheet', 'json',
])

export type CellSaveState = 'saving' | 'saved'

export interface UseInlineEditingOptions {
  data: Record<string, unknown>[]
  fields: Field[]
  /** Visible column IDs in order (from TanStack table). */
  columnIds: string[]
  onCellSave: (rowId: string, fieldSlug: string, value: unknown) => Promise<void>
  onCellClear: (rowId: string, fieldSlug: string) => Promise<void>
  /** Column IDs that are never editable (system columns). */
  readOnlyColumns?: Set<string>
  /** Navigation callback after commit (from useGridNavigation). */
  moveTo: (row: number, col: number, extend: boolean) => void
}

export function useInlineEditing({
  data,
  fields,
  columnIds,
  onCellSave,
  onCellClear,
  readOnlyColumns = new Set(),
  moveTo,
}: UseInlineEditingOptions) {
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null)
  const [editValue, setEditValue] = useState<unknown>(null)
  const [cellSaveState, setCellSaveState] = useState<Map<string, CellSaveState>>(new Map())
  const originalValueRef = useRef<unknown>(null)

  const isEditing = editingCell !== null

  /** Map column index → Field. Returns null for non-editable columns. */
  const getFieldForCol = useCallback(
    (colIdx: number): Field | null => {
      const colId = columnIds[colIdx]
      if (!colId || readOnlyColumns.has(colId)) return null
      const field = fields.find((f) => f.slug === colId)
      if (!field) return null
      if (READ_ONLY_TYPES.has(field.field_type)) return null
      return field
    },
    [columnIds, fields, readOnlyColumns],
  )

  /** Check if a column is editable. */
  const isEditableCol = useCallback(
    (colIdx: number): boolean => {
      const field = getFieldForCol(colIdx)
      if (!field) return false
      if (DIALOG_TYPES.has(field.field_type)) return false
      return true
    },
    [getFieldForCol],
  )

  /** Start editing a cell. */
  const startEditing = useCallback(
    (row: number, col: number, initialChar?: string) => {
      if (!isEditableCol(col)) return
      if (row >= data.length) return // new row handled separately

      const colId = columnIds[col]
      const currentValue = data[row]?.[colId]

      // Boolean: toggle immediately, no edit state
      const field = getFieldForCol(col)
      if (field?.field_type === 'boolean') {
        const rowId = String(data[row]?.id)
        const newVal = !currentValue
        const key = `${rowId}:${colId}`
        setCellSaveState((prev) => new Map(prev).set(key, 'saving'))
        onCellSave(rowId, colId, newVal).then(() => {
          setCellSaveState((prev) => new Map(prev).set(key, 'saved'))
          setTimeout(() => {
            setCellSaveState((prev) => {
              const next = new Map(prev)
              next.delete(key)
              return next
            })
          }, 1500)
        }).catch(() => {
          setCellSaveState((prev) => {
            const next = new Map(prev)
            next.delete(key)
            return next
          })
        })
        return
      }

      originalValueRef.current = currentValue

      // If a character key started the edit, use it as initial value
      if (initialChar) {
        setEditValue(initialChar)
      } else {
        setEditValue(currentValue ?? '')
      }
      setEditingCell({ row, col })
    },
    [isEditableCol, data, columnIds, getFieldForCol, onCellSave],
  )

  /** Commit the current edit. */
  const commitEdit = useCallback(
    async () => {
      if (!editingCell) return
      const { row, col } = editingCell
      const colId = columnIds[col]
      const rowId = String(data[row]?.id)
      const key = `${rowId}:${colId}`

      // Don't save if value unchanged
      if (editValue === originalValueRef.current) {
        setEditingCell(null)
        return
      }

      setEditingCell(null)
      setCellSaveState((prev) => new Map(prev).set(key, 'saving'))

      try {
        await onCellSave(rowId, colId, editValue)
        setCellSaveState((prev) => new Map(prev).set(key, 'saved'))
        setTimeout(() => {
          setCellSaveState((prev) => {
            const next = new Map(prev)
            next.delete(key)
            return next
          })
        }, 1500)
      } catch {
        setCellSaveState((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      }
    },
    [editingCell, editValue, data, columnIds, onCellSave],
  )

  /** Cancel the current edit. */
  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue(null)
  }, [])

  /** Clear a cell value (Delete/Backspace in idle mode). */
  const clearCell = useCallback(
    (row: number, col: number) => {
      if (!isEditableCol(col)) return
      if (row >= data.length) return

      const colId = columnIds[col]
      const rowId = String(data[row]?.id)
      const key = `${rowId}:${colId}`

      setCellSaveState((prev) => new Map(prev).set(key, 'saving'))
      onCellClear(rowId, colId).then(() => {
        setCellSaveState((prev) => new Map(prev).set(key, 'saved'))
        setTimeout(() => {
          setCellSaveState((prev) => {
            const next = new Map(prev)
            next.delete(key)
            return next
          })
        }, 1500)
      }).catch(() => {
        setCellSaveState((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      })
    },
    [isEditableCol, data, columnIds, onCellClear],
  )

  /** Handle keyboard events when in editing mode. */
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingCell) return

      switch (e.key) {
        case 'Enter':
          if (e.shiftKey) return // Allow Shift+Enter for textarea newlines
          e.preventDefault()
          e.stopPropagation()
          commitEdit().then(() => {
            moveTo(editingCell.row + 1, editingCell.col, false)
          })
          break
        case 'Tab':
          e.preventDefault()
          e.stopPropagation()
          commitEdit().then(() => {
            if (e.shiftKey) {
              moveTo(editingCell.row, editingCell.col - 1, false)
            } else {
              moveTo(editingCell.row, editingCell.col + 1, false)
            }
          })
          break
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          cancelEdit()
          break
      }
    },
    [editingCell, commitEdit, cancelEdit, moveTo],
  )

  return {
    editingCell,
    editValue,
    setEditValue,
    isEditing,
    startEditing,
    commitEdit,
    cancelEdit,
    clearCell,
    cellSaveState,
    handleEditKeyDown,
    getFieldForCol,
    isEditableCol,
  }
}
