/**
 * useInlineEditing — Cell editing state machine for spreadsheet-like grids.
 *
 * States: idle -> editing -> saving -> idle
 *
 * State (editingCell, editValue, cellSaveState) lives in the Zustand grid store.
 * This hook is a thin wrapper that wires callbacks and keeps refs locally.
 */
import { useCallback, useContext, useRef } from 'react'
import { useStore } from 'zustand'

import { GridStoreContext, type GridStore } from '@/stores/grid'
import { selectEditingCell, selectEditValue, selectCellSaveState } from '@/stores/grid/selectors'
import type { Field, FieldType } from '@/lib/types'

// Re-export for backward compat.
export type { CellSaveState } from '@/stores/grid'

/** Field types that cannot be inline-edited. */
const READ_ONLY_TYPES: Set<FieldType> = new Set([
  'formula', 'lookup', 'rollup', 'autonumber',
  'label', 'line', 'spacer',
])

/** Field types that are not inline-editable (open dialog instead). */
const DIALOG_TYPES: Set<FieldType> = new Set([
  'file', 'table', 'spreadsheet', 'json',
])

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
  /** Number of empty rows beyond data (free grid mode). 0 = no empty rows. */
  emptyRowCount?: number
  /** Called when a cell in an empty row is committed. */
  onEmptyRowSave?: (fieldSlug: string, value: unknown) => Promise<void>
  /** Optional store instance — pass when calling outside GridStoreContext.Provider. */
  store?: GridStore
}

export function useInlineEditing({
  data,
  fields,
  columnIds,
  onCellSave,
  onCellClear,
  readOnlyColumns = new Set(),
  moveTo,
  emptyRowCount = 0,
  onEmptyRowSave,
  store,
}: UseInlineEditingOptions) {
  // ── Store resolution ────────────────────────────────────────────────
  // Use the explicitly passed store, or fall back to context.
  const ctxStore = useContext(GridStoreContext)
  const resolvedStore = store ?? ctxStore
  if (!resolvedStore) throw new Error('useInlineEditing requires a GridStore via `store` prop or GridStoreContext.Provider')

  // ── Store subscriptions ────────────────────────────────────────────
  const editingCell = useStore(resolvedStore, selectEditingCell)
  const editValue = useStore(resolvedStore, selectEditValue)
  const cellSaveState = useStore(resolvedStore, selectCellSaveState)
  const setEditingCell = useStore(resolvedStore, (s) => s.setEditingCell)
  const setEditValue = useStore(resolvedStore, (s) => s.setEditValue)
  const updateCellSaveState = useStore(resolvedStore, (s) => s.updateCellSaveState)

  const originalValueRef = useRef<unknown>(null)

  const isEditing = editingCell !== null

  /** Map column index -> Field. Returns null for non-editable columns. */
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
      const isEmptyRow = row >= data.length && row < data.length + emptyRowCount
      if (row >= data.length && !isEmptyRow) return

      if (isEmptyRow) {
        originalValueRef.current = null
        setEditValue(initialChar ?? '')
        setEditingCell({ row, col })
        return
      }

      const colId = columnIds[col]
      const currentValue = data[row]?.[colId]

      // Boolean: toggle immediately, no edit state
      const field = getFieldForCol(col)
      if (field?.field_type === 'boolean') {
        const rowId = String(data[row]?.id)
        const newVal = !currentValue
        const key = `${rowId}:${colId}`
        updateCellSaveState(key, 'saving')
        onCellSave(rowId, colId, newVal).then(() => {
          updateCellSaveState(key, 'saved')
          setTimeout(() => updateCellSaveState(key, null), 1500)
        }).catch(() => {
          updateCellSaveState(key, null)
        })
        return
      }

      originalValueRef.current = currentValue

      if (initialChar) {
        setEditValue(initialChar)
      } else {
        setEditValue(currentValue ?? '')
      }
      setEditingCell({ row, col })
    },
    [isEditableCol, data, columnIds, getFieldForCol, onCellSave, emptyRowCount, setEditingCell, setEditValue, updateCellSaveState],
  )

  /** Commit the current edit. */
  const commitEdit = useCallback(
    async () => {
      if (!editingCell) return
      const { row, col } = editingCell
      const colId = columnIds[col]

      // Empty row commit
      if (row >= data.length) {
        setEditingCell(null)
        if (editValue != null && editValue !== '' && onEmptyRowSave) {
          await onEmptyRowSave(colId, editValue)
        }
        return
      }

      const rowId = String(data[row]?.id)
      const key = `${rowId}:${colId}`

      if (editValue === originalValueRef.current) {
        setEditingCell(null)
        return
      }

      setEditingCell(null)
      updateCellSaveState(key, 'saving')

      try {
        await onCellSave(rowId, colId, editValue)
        updateCellSaveState(key, 'saved')
        setTimeout(() => updateCellSaveState(key, null), 1500)
      } catch {
        updateCellSaveState(key, null)
      }
    },
    [editingCell, editValue, data, columnIds, onCellSave, onEmptyRowSave, setEditingCell, updateCellSaveState],
  )

  /** Cancel the current edit. */
  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue(null)
  }, [setEditingCell, setEditValue])

  /** Clear a cell value (Delete/Backspace in idle mode). */
  const clearCell = useCallback(
    (row: number, col: number) => {
      if (!isEditableCol(col)) return
      if (row >= data.length) return

      const colId = columnIds[col]
      const rowId = String(data[row]?.id)
      const key = `${rowId}:${colId}`

      updateCellSaveState(key, 'saving')
      onCellClear(rowId, colId).then(() => {
        updateCellSaveState(key, 'saved')
        setTimeout(() => updateCellSaveState(key, null), 1500)
      }).catch(() => {
        updateCellSaveState(key, null)
      })
    },
    [isEditableCol, data, columnIds, onCellClear, updateCellSaveState],
  )

  /** Handle keyboard events when in editing mode. */
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingCell) return

      switch (e.key) {
        case 'Enter':
          if (e.shiftKey) return
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
