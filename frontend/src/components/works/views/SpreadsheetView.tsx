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
import { useFormulaEngine } from '@/hooks/useFormulaEngine'
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
  toolbarRight?: React.ReactNode
  summaryRow?: Record<string, { label: string; value: string | number }>
  summaryFn?: Record<string, string>
  onSummaryFnChange?: (columnId: string, fn: string) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  onInsertRow?: () => void
  onFilterByValue?: (fieldSlug: string, value: unknown) => void
  /** When true, filtering/sorting/pagination is handled client-side by tanstack. */
  clientMode?: boolean
  /** Client-side column filters (used when clientMode is true). */
  globalFilter?: string
  /** Client-side filter function (used when clientMode is true). */
  columnFilters?: { id: string; value: unknown }[]
  onRenameColumn?: (columnId: string, newLabel: string) => void
  onDeleteColumn?: (columnId: string) => void
  onAddColumn?: () => void
  onActiveCellChange?: (cell: import('@/hooks/useGridNavigation').CellPosition | null, selection: import('@/hooks/useGridNavigation').SelectionRange | null) => void
  onFormatShortcut?: (key: 'bold' | 'italic') => void
}

/**
 * Parse a date string from various formats (Excel, Korean, ISO, US).
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
function parseDateFlexible(raw: string): string | null {
  // ISO: 2024-03-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // Korean dot: 2024.03.15
  const dotMatch = raw.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/)
  if (dotMatch) {
    return `${dotMatch[1]}-${dotMatch[2].padStart(2, '0')}-${dotMatch[3].padStart(2, '0')}`
  }
  // Korean text: 2024년 3월 15일
  const koMatch = raw.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/)
  if (koMatch) {
    return `${koMatch[1]}-${koMatch[2].padStart(2, '0')}-${koMatch[3].padStart(2, '0')}`
  }
  // US format: 3/15/2024 or 03/15/2024
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`
  }
  // ISO datetime: 2024-03-15T09:00:00
  const dtMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ]/)
  if (dtMatch) return dtMatch[1]
  return null
}

/** Coerce a pasted string value to the appropriate type for a field. */
function coerceValue(raw: string, field: Field): unknown {
  if (raw === '') return null
  switch (field.field_type) {
    case 'number': {
      const cleaned = raw.replace(/[,₩$€¥\s]/g, '').replace(/%$/, '')
      const n = parseFloat(cleaned)
      return isNaN(n) ? null : n
    }
    case 'integer': {
      const cleaned = raw.replace(/[,₩$€¥\s]/g, '')
      const n = parseInt(cleaned, 10)
      return isNaN(n) ? null : n
    }
    case 'boolean':
      return ['true', '1', '✓', '참', 'yes', 'y'].includes(raw.toLowerCase())
    case 'date': {
      const parsed = parseDateFlexible(raw)
      return parsed ?? raw
    }
    case 'datetime': {
      // Try to preserve full datetime, fall back to date-only
      if (/^\d{4}-\d{2}-\d{2}[T ]/.test(raw)) return raw
      const parsed = parseDateFlexible(raw)
      return parsed ?? raw
    }
    case 'time':
      return raw
    case 'multiselect':
      return raw.split(',').map((s) => s.trim()).filter(Boolean)
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
  toolbarRight,
  summaryRow,
  summaryFn,
  onSummaryFnChange,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onInsertRow,
  onFilterByValue,
  clientMode,
  globalFilter,
  columnFilters,
  onRenameColumn,
  onDeleteColumn,
  onAddColumn,
  onActiveCellChange,
  onFormatShortcut,
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

  // Formula engine for instant formula recomputation after cell edits
  const { recomputeRow } = useFormulaEngine(editableFields)

  // System columns and reverse relation columns should never be editable.
  const readOnlyColumns = useMemo(() => {
    const s = new Set(['_select', '_actions', 'created_at', '_status'])
    // Mark all reverse relation columns as read-only.
    if (data.length > 0) {
      for (const key of Object.keys(data[0])) {
        if (key.startsWith('_reverse_')) s.add(key)
      }
    }
    return s
  }, [data])

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

    // Auto-detect reverse relation keys (_reverse_*) from data and add columns.
    if (data.length > 0) {
      const sample = data[0]
      for (const key of Object.keys(sample)) {
        if (!key.startsWith('_reverse_')) continue
        const rev = sample[key] as { count?: number; label?: string } | undefined
        const headerLabel = rev?.label ? `${rev.label}` : key.replace('_reverse_', '').replaceAll('_', ' ')
        cols.push({
          id: key,
          header: headerLabel,
          enableSorting: false,
          size: 100,
          cell: ({ row }: { row: { original: Record<string, unknown> } }) => {
            const val = row.original[key] as { count?: number; ids?: string[] } | undefined
            const count = val?.count ?? 0
            if (count === 0) return <span className="text-muted-foreground">-</span>
            return (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {count}건
              </span>
            )
          },
        })
      }
    }

    return cols
  }, [collection, data])

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
        // Recompute formula fields locally for instant feedback.
        // Formula values are included in the optimistic update body so they
        // appear immediately in the React Query cache. The server ignores
        // formula keys (no DB column).
        const row = data.find((r) => String(r.id) === rowId)
        const patchedRow = row ? { ...row, [fieldSlug]: value } : undefined
        const formulaOverrides = patchedRow ? recomputeRow(patchedRow, fieldSlug) : {}
        await updateEntry({ id: rowId, body: { [fieldSlug]: value, ...formulaOverrides } })
      } catch (err) {
        toast.error('저장 ��패')
        throw err
      }
    },
    onCellClear: async (rowId, fieldSlug) => {
      try {
        const row = data.find((r) => String(r.id) === rowId)
        const patchedRow = row ? { ...row, [fieldSlug]: null } : undefined
        const formulaOverrides = patchedRow ? recomputeRow(patchedRow, fieldSlug) : {}
        await updateEntry({ id: rowId, body: { [fieldSlug]: null, ...formulaOverrides } })
      } catch (err) {
        toast.error('삭제 실패')
        throw err
      }
    },
    readOnlyColumns,
    moveTo: () => {}, // Navigation managed by DataTable's internal grid
  })

  // Fill handle handler
  const handleFill = useCallback(
    (updates: { id: string; fields: Record<string, unknown> }[]) => {
      // Recompute formula fields for each filled row
      const enriched = updates.map((u) => {
        const row = data.find((r) => String(r.id) === u.id)
        if (!row) return u
        const patchedRow = { ...row, ...u.fields }
        let formulaOverrides: Record<string, unknown> = {}
        for (const slug of Object.keys(u.fields)) {
          formulaOverrides = { ...formulaOverrides, ...recomputeRow(patchedRow, slug) }
        }
        return { ...u, fields: { ...u.fields, ...formulaOverrides } }
      })
      if (enriched.length > 0) {
        batchUpdateEntry(enriched)
      }
    },
    [data, recomputeRow, batchUpdateEntry],
  )

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
          // Recompute formula fields for each pasted row
          const patchedRow = { ...dataRow, ...fields }
          const changedSlugs = Object.keys(fields)
          let formulaOverrides: Record<string, unknown> = {}
          for (const slug of changedSlugs) {
            formulaOverrides = { ...formulaOverrides, ...recomputeRow(patchedRow, slug) }
          }
          updates.push({ id: String(dataRow.id), fields: { ...fields, ...formulaOverrides } })
        }
      }
      if (updates.length > 0) {
        batchUpdateEntry(updates)
        toast.success(`${updates.length}행 붙여넣기 완료`)
      }
    },
    [data, visibleColumnIds, readOnlyColumns, editableFields, batchUpdateEntry, recomputeRow],
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
      toolbarRight={toolbarRight}
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
      onInsertRow={canManage ? onInsertRow : undefined}
      onFilterByValue={onFilterByValue}
      onFill={canManage ? handleFill : undefined}
      onCellMove={canManage ? handleFill : undefined}
      clientMode={clientMode}
      globalFilter={globalFilter}
      columnFilters={columnFilters}
      showNewRow={canManage}
      newRowValues={newRowValues}
      onNewRowChange={(slug, v) => setNewRowValues((prev) => ({ ...prev, [slug]: v }))}
      onNewRowCommit={() => {
        if (Object.keys(newRowValues).length > 0) {
          createEntry(newRowValues).then(() => setNewRowValues({})).catch(() => {})
        }
      }}
      columnManagement={canManage && !!(onRenameColumn || onDeleteColumn || onAddColumn)}
      onRenameColumn={onRenameColumn}
      onDeleteColumn={onDeleteColumn}
      onAddColumn={onAddColumn}
      onActiveCellChange={onActiveCellChange}
      onFormatShortcut={onFormatShortcut}
    />
  )
}
