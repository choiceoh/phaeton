/**
 * SpreadsheetView — Excel-like inline editing view for collection data.
 *
 * Wraps DataTable with inline editing capabilities via useInlineEditing.
 * Receives data from the parent (AppViewPage) — no duplicate fetching.
 */
import type { ColumnDef, SortingState, VisibilityState, ColumnPinningState } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { DataTable } from '@/components/common/DataTable'
import { useInlineEditing } from '@/hooks/useInlineEditing'
import { isLayoutType, isComputedType } from '@/lib/constants'
import { formatCell } from '@/lib/formatCell'
import type { Collection, Field } from '@/lib/types'

interface SpreadsheetViewProps {
  collection: Collection
  data: Record<string, unknown>[]
  total: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  onSortChange: (sort: SortingState) => void
  onRowClick: (row: Record<string, unknown>) => void
  updateEntry: (params: { id: string; body: Record<string, unknown> }) => Promise<unknown>
  createEntry: (body: Record<string, unknown>) => Promise<unknown>
  deleteEntry: (id: string) => void
  batchUpdateEntry: (updates: { id: string; fields: Record<string, unknown> }[]) => void
  canManage: boolean
  toolbar?: React.ReactNode
  summaryRow?: Record<string, { label: string; value: string | number }>
  summaryFn?: Record<string, string>
  onSummaryFnChange?: (columnId: string, fn: string) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

/** Coerce a pasted string value to the appropriate type for a field. */
function coerceValue(raw: string, field: Field): unknown {
  if (raw === '') return null
  switch (field.field_type) {
    case 'number':
      return parseFloat(raw) || null
    case 'integer':
      return parseInt(raw, 10) || null
    case 'boolean':
      return raw.toLowerCase() === 'true' || raw === '1' || raw === '✓'
    case 'date':
    case 'datetime':
    case 'time':
      return raw
    default:
      return raw
  }
}

export default function SpreadsheetView({
  collection,
  data,
  total,
  page,
  limit,
  onPageChange,
  onLimitChange,
  onSortChange,
  onRowClick,
  updateEntry,
  createEntry,
  deleteEntry,
  batchUpdateEntry,
  canManage,
  toolbar,
  summaryRow,
  summaryFn,
  onSummaryFnChange,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: SpreadsheetViewProps) {
  const [newRowValues, setNewRowValues] = useState<Record<string, unknown>>({})

  // Column visibility/pinning persistence
  const colVisStorageKey = collection.id ? `phaeton:colvis:${collection.id}:spreadsheet` : null
  const colPinStorageKey = collection.id ? `phaeton:colpin:${collection.id}:spreadsheet` : null

  const [initialColumnVisibility] = useState<VisibilityState>(() => {
    if (colVisStorageKey) {
      try {
        const saved = localStorage.getItem(colVisStorageKey)
        if (saved) return JSON.parse(saved)
      } catch { /* ignore */ }
    }
    if (!collection?.fields) return {}
    const dataFields = collection.fields.filter((f) => !isLayoutType(f.field_type))
    const vis: Record<string, boolean> = {}
    dataFields.forEach((f, i) => {
      if (i >= 8) vis[f.slug] = false
    })
    return vis
  })

  const [initialColumnPinning] = useState<ColumnPinningState>(() => {
    if (colPinStorageKey) {
      try {
        const saved = localStorage.getItem(colPinStorageKey)
        if (saved) return JSON.parse(saved)
      } catch { /* ignore */ }
    }
    return { left: [], right: [] }
  })

  const handleColumnVisibilityChange = useCallback(
    (vis: VisibilityState) => {
      if (colVisStorageKey) {
        try { localStorage.setItem(colVisStorageKey, JSON.stringify(vis)) } catch { /* ignore */ }
      }
    },
    [colVisStorageKey],
  )

  const handleColumnPinningChange = useCallback(
    (pin: ColumnPinningState) => {
      if (colPinStorageKey) {
        try { localStorage.setItem(colPinStorageKey, JSON.stringify(pin)) } catch { /* ignore */ }
      }
    },
    [colPinStorageKey],
  )

  // Editable fields (exclude layout/computed)
  const editableFields = useMemo(
    () => collection?.fields?.filter((f) => !isLayoutType(f.field_type)) ?? [],
    [collection],
  )

  // System columns that should never be editable
  const readOnlyColumns = useMemo(
    () => new Set(['_select', '_actions', 'created_at', '_status']),
    [],
  )

  // Build columns (similar to AppViewPage but simpler — no search highlighting)
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!collection?.fields) return []
    const cols: ColumnDef<Record<string, unknown>>[] = []

    cols.push(
      ...collection.fields
        .filter((f) => !isLayoutType(f.field_type))
        .map((f) => ({
          id: f.slug,
          header: f.label,
          enableSorting: true,
          size: f.field_type === 'textarea' ? 250 : 150,
          cell: ({ row }: { row: { original: Record<string, unknown> } }) => {
            const v = row.original[f.slug]
            return formatCell(v, f)
          },
        })),
    )

    cols.push({
      id: 'created_at',
      header: '작성일',
      enableSorting: true,
      size: 100,
      cell: ({ row }) => {
        const v = row.original.created_at
        if (!v) return '-'
        return new Date(v as string).toLocaleDateString('ko')
      },
    })

    return cols
  }, [collection])

  // Visible column IDs (derived from TanStack table — approximated here)
  const visibleColumnIds = useMemo(
    () => columns.map((c) => c.id ?? '').filter(Boolean),
    [columns],
  )

  // Inline editing
  const inlineEditing = useInlineEditing({
    data,
    fields: editableFields,
    columnIds: visibleColumnIds,
    onCellSave: async (rowId, fieldSlug, value) => {
      try {
        await updateEntry({ id: rowId, body: { [fieldSlug]: value } })
      } catch (err) {
        toast.error('저장 ��패')
        throw err
      }
    },
    onCellClear: async (rowId, fieldSlug) => {
      try {
        await updateEntry({ id: rowId, body: { [fieldSlug]: null } })
      } catch (err) {
        toast.error('삭제 실패')
        throw err
      }
    },
    readOnlyColumns,
    moveTo: () => {}, // Navigation managed by DataTable's internal grid
  })

  // Paste handler
  const handlePaste = useCallback(
    (startRow: number, startCol: number, matrix: string[][]) => {
      const updates: { id: string; fields: Record<string, unknown> }[] = []
      for (let r = 0; r < matrix.length; r++) {
        const dataRow = data[startRow + r]
        if (!dataRow) continue
        const fields: Record<string, unknown> = {}
        for (let c = 0; c < matrix[r].length; c++) {
          const colId = visibleColumnIds[startCol + c]
          if (!colId || readOnlyColumns.has(colId)) continue
          const field = editableFields.find((f) => f.slug === colId)
          if (!field || isComputedType(field.field_type)) continue
          fields[colId] = coerceValue(matrix[r][c], field)
        }
        if (Object.keys(fields).length > 0) {
          updates.push({ id: String(dataRow.id), fields })
        }
      }
      if (updates.length > 0) {
        batchUpdateEntry(updates)
        toast.success(`${updates.length}행 붙여넣기 완료`)
      }
    },
    [data, visibleColumnIds, readOnlyColumns, editableFields, batchUpdateEntry],
  )

  return (
    <DataTable
      columns={columns}
      data={data}
      total={total}
      page={page}
      limit={limit}
      onPageChange={onPageChange}
      onLimitChange={onLimitChange}
      onSortChange={onSortChange}
      onRowClick={onRowClick}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={emptyAction}
      summaryRow={summaryRow}
      summaryFn={summaryFn}
      onSummaryFnChange={onSummaryFnChange}
      toolbar={toolbar}
      initialColumnVisibility={initialColumnVisibility}
      onColumnVisibilityChange={handleColumnVisibilityChange}
      initialColumnPinning={initialColumnPinning}
      onColumnPinningChange={handleColumnPinningChange}
      // Inline editing props
      editable={canManage}
      fields={editableFields}
      editingCell={inlineEditing.editingCell}
      editValue={inlineEditing.editValue}
      onEditValueChange={inlineEditing.setEditValue}
      onStartEditing={inlineEditing.startEditing}
      onCommitEdit={inlineEditing.commitEdit}
      onCancelEdit={inlineEditing.cancelEdit}
      cellSaveState={inlineEditing.cellSaveState}
      isEditingCell={inlineEditing.isEditing}
      onEditKeyDown={inlineEditing.handleEditKeyDown}
      getFieldForCol={inlineEditing.getFieldForCol}
      onClearCell={inlineEditing.clearCell}
      onPaste={handlePaste}
      onDeleteRow={canManage ? deleteEntry : undefined}
      showNewRow={canManage}
      newRowValues={newRowValues}
      onNewRowChange={(slug, v) => setNewRowValues((prev) => ({ ...prev, [slug]: v }))}
      onNewRowCommit={() => {
        if (Object.keys(newRowValues).length > 0) {
          createEntry(newRowValues).then(() => setNewRowValues({})).catch(() => {})
        }
      }}
    />
  )
}
