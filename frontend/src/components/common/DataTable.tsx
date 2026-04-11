/**
 * DataTable — Spreadsheet-like grid built on @tanstack/react-table.
 *
 * Features:
 * - Keyboard navigation (arrows, Tab, Enter, Ctrl+A) via useGridNavigation
 * - Inline cell editing with type-specific editors (GridCell)
 * - Column visibility, pinning (left/right), resizing
 * - Row selection with checkboxes
 * - Copy/paste (Ctrl+C/V) via clipboard.ts
 * - Cell save state visual feedback (spinner -> checkmark)
 * - Summary row with aggregate functions (sum/avg/min/max/count)
 * - Pagination with page size selector
 *
 * This is a controlled component: parent owns data, sort, filter, and pagination state.
 */
import {
  type Column,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnPinningState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDownUp,
  ChevronsLeft,
  ChevronsRight,
  Pencil,
  PinIcon,
  PinOffIcon,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CellPosition } from '@/hooks/useGridNavigation'
import { isCellInRange, useGridNavigation } from '@/hooks/useGridNavigation'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import { useCellDragMove } from '@/hooks/useCellDragMove'
import { useFillHandle } from '@/hooks/useFillHandle'
import type { CellSaveState } from '@/hooks/useInlineEditing'
import { copyToClipboard, pasteFromClipboard } from '@/lib/clipboard'
import { PAGE_SIZE_OPTIONS } from '@/lib/constants'

import { Checkbox } from '@/components/ui/checkbox'

import EmptyState from './EmptyState'
import GridCell from './GridCell'
import GridContextMenu from './GridContextMenu'
import type { EntryRow, Field } from '@/lib/types'

/** Convert a 0-based column index to Excel-style letter (0→A, 25→Z, 26→AA). */
function colIndexToLetter(idx: number): string {
  let result = ''
  let n = idx
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

interface Props<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  total?: number
  page?: number
  limit?: number
  onPageChange?: (page: number) => void
  onLimitChange?: (limit: number) => void
  onSortChange?: (sort: SortingState) => void
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  emptyVariant?: 'empty' | 'no-results' | 'no-permission'
  summaryRow?: Record<string, { label: string; value: string | number }>
  /** Current aggregate function per column slug (for footer dropdown). */
  summaryFn?: Record<string, string>
  /** Called when user changes the aggregate function for a column. */
  onSummaryFnChange?: (columnId: string, fn: string) => void
  toolbar?: React.ReactNode
  /** Extra content rendered between toolbar and column toggle (e.g. view tabs). */
  toolbarRight?: React.ReactNode
  initialColumnVisibility?: VisibilityState
  /** Called when column visibility changes */
  onColumnVisibilityChange?: (visibility: VisibilityState) => void
  /** Number of top rows to highlight (e.g. after CSV import). */
  highlightRows?: number
  /** ID of a newly created row to animate entrance. */
  newRowId?: string | null
  /** Initial column pinning state (e.g. restored from localStorage). */
  initialColumnPinning?: ColumnPinningState
  /** Called when column pinning changes (for persistence). */
  onColumnPinningChange?: (pinning: ColumnPinningState) => void
  /** Enable row selection with checkboxes */
  selectable?: boolean
  /** Currently selected row IDs (controlled) */
  selectedRowIds?: Set<string>
  /** Called when selection changes */
  onSelectionChange?: (ids: Set<string>) => void
  /** Total filtered results across all pages (for select-all banner). */
  totalFiltered?: number
  /** Called when user clicks "select all filtered". */
  onSelectAllFiltered?: () => void

  // --- Inline editing props (optional, used by SpreadsheetView) ---
  /** Enable inline cell editing mode. */
  editable?: boolean
  /** Collection fields metadata for cell editors. */
  fields?: Field[]
  /** Currently editing cell position. */
  editingCell?: CellPosition | null
  /** Current edit value. */
  editValue?: unknown
  /** Called when edit value changes. */
  onEditValueChange?: (v: unknown) => void
  /** Called to start editing a cell (double-click or key). */
  onStartEditing?: (row: number, col: number, initialChar?: string) => void
  /** Called to commit the current edit. */
  onCommitEdit?: () => void
  /** Called to cancel the current edit. */
  onCancelEdit?: () => void
  /** Save state per cell ("rowId:colSlug" → 'saving'|'saved'). */
  cellSaveState?: Map<string, CellSaveState>
  /** Whether a cell is currently being edited (suppresses navigation). */
  isEditingCell?: boolean
  /** Keyboard handler for editing mode. */
  onEditKeyDown?: (e: React.KeyboardEvent) => void
  /** Get field metadata for a column index. */
  getFieldForCol?: (colIdx: number) => Field | null
  /** Called when Delete/Backspace clears a cell. */
  onClearCell?: (row: number, col: number) => void
  /** Called when pasting data from clipboard. */
  onPaste?: (startRow: number, startCol: number, matrix: string[][]) => void
  /** Cell context menu actions. */
  onDeleteRow?: (rowId: string) => void
  /** Called when user requests inserting a new row via context menu. */
  onInsertRow?: () => void
  /** Called when user requests filtering by a cell's value. */
  onFilterByValue?: (fieldSlug: string, value: unknown) => void
  /** Called when fill handle drag completes. */
  onFill?: (updates: { id: string; fields: Record<string, unknown> }[]) => void
  /** Called when cells are dragged to move or copy. */
  onCellMove?: (updates: { id: string; fields: Record<string, unknown> }[]) => void
  /** Show the bottom empty row for new entries. */
  showNewRow?: boolean
  /** Current values in the new row. */
  newRowValues?: Record<string, unknown>
  /** Called when a field in the new row changes. */
  onNewRowChange?: (fieldSlug: string, value: unknown) => void
  /** Called to commit the new row. */
  onNewRowCommit?: () => void
  /** When true, filtering/sorting/pagination is handled client-side. */
  clientMode?: boolean
  /** Global filter string for client-side text search. */
  globalFilter?: string
  /** Per-column filters for client-side filtering. */
  columnFilters?: { id: string; value: unknown }[]

  // --- Free grid mode (empty rows below data) ---
  /** Number of empty rows to show below data (free grid mode). */
  emptyRowCount?: number
  /** Called when fill extends into empty rows. */
  onFillIntoEmptyRows?: (rows: Record<string, unknown>[]) => void

  // --- Column management (optional, used by SpreadsheetView) ---
  /** Called to rename a column. */
  onRenameColumn?: (columnId: string, newLabel: string) => void
  /** Called to delete a column. */
  onDeleteColumn?: (columnId: string) => void
  /** Called to add a new column. */
  onAddColumn?: () => void
  /** Whether column management is enabled. */
  columnManagement?: boolean
  /** Free grid mode: edits are local-only, no server calls */
  freeGridMode?: boolean
  /** Returns true if a cell has been locally modified but not saved */
  cellDirtyFn?: (rowId: string, fieldSlug: string) => boolean
  /** Returns error message for a cell (from coercion failure on save attempt) */
  cellErrorFn?: (rowId: string, fieldSlug: string) => string | null
}

// DataTable wraps @tanstack/react-table with shadcn UI primitives.
// All sort/filter/pagination state is controlled by the parent — this
// component just renders. Server-side data fetching is the parent's job.
export function DataTable<T>({
  columns,
  data,
  total,
  page = 1,
  limit = 20,
  onPageChange,
  onLimitChange,
  onSortChange,
  onRowClick,
  emptyTitle = '데이터가 없습니다',
  emptyDescription,
  emptyAction,
  emptyVariant,
  summaryRow,
  summaryFn,
  onSummaryFnChange,
  toolbar,
  toolbarRight,
  initialColumnVisibility,
  onColumnVisibilityChange: onColumnVisibilityChangeProp,
  initialColumnPinning,
  onColumnPinningChange: onColumnPinningChangeProp,
  highlightRows = 0,
  newRowId,
  selectable,
  selectedRowIds,
  onSelectionChange,
  totalFiltered,
  onSelectAllFiltered,
  // Inline editing props
  editable,
  fields: editableFields,
  editingCell,
  editValue,
  onEditValueChange,
  onStartEditing,
  onCommitEdit,
  onCancelEdit,
  cellSaveState,
  isEditingCell,
  onEditKeyDown,
  getFieldForCol,
  onClearCell,
  onPaste,
  onDeleteRow,
  onInsertRow,
  onFilterByValue,
  onFill,
  onCellMove,
  showNewRow,
  newRowValues,
  onNewRowChange,
  onNewRowCommit,
  clientMode,
  globalFilter: globalFilterProp,
  columnFilters: columnFiltersProp,
  emptyRowCount = 0,
  onFillIntoEmptyRows,
  onRenameColumn,
  onDeleteColumn,
  onAddColumn,
  columnManagement,
  freeGridMode,
  cellDirtyFn,
  cellErrorFn,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility ?? {})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(() => {
    const base = initialColumnPinning ?? { left: [], right: [] }
    // Ensure _rowNum is always pinned left.
    const left = base.left ?? []
    if (!left.includes('_rowNum')) {
      return { ...base, left: ['_rowNum', ...left] }
    }
    return base
  })
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({})
  const [rowSizing, setRowSizing] = useState<Record<number, number>>({})
  const [resizingRow, setResizingRow] = useState<{ idx: number; startY: number; startH: number } | null>(null)
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([])

  // Horizontal scroll indicator state.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      setCanScrollRight(
        el.scrollWidth > el.clientWidth &&
        el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      )
    }
    check()
    el.addEventListener('scroll', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [data, columnVisibility])

  // Row resize drag handler.
  useEffect(() => {
    if (!resizingRow) return
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientY - resizingRow.startY
      setRowSizing((prev) => ({
        ...prev,
        [resizingRow.idx]: Math.max(20, resizingRow.startH + delta),
      }))
    }
    const handleMouseUp = () => setResizingRow(null)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingRow])

  // Prepend row number column + optional checkbox column.
  const augmentedColumns = useMemo(() => {
    const cols: ColumnDef<T, unknown>[] = []

    // Row number column — always first, always pinned left.
    const rowNumCol: ColumnDef<T, unknown> = {
      id: '_rowNum',
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      size: 40,
      header: () => null,
      cell: ({ row }) => {
        const idx = data.indexOf(row.original)
        const num = (page - 1) * limit + idx + 1
        return (
          <div className="relative h-full">
            <span className="text-[11px] text-stone-400 select-none text-center block tabular-nums">{num}</span>
            {/* Row resize handle */}
            <div
              className="absolute bottom-0 left-0 w-full h-[3px] cursor-row-resize hover:bg-primary/30 z-10"
              onMouseDown={(e) => {
                e.stopPropagation()
                const td = (e.target as HTMLElement).closest('td')!
                setResizingRow({ idx, startY: e.clientY, startH: td.offsetHeight })
              }}
            />
          </div>
        )
      },
    }
    cols.push(rowNumCol)

    if (selectable) {
      const checkCol: ColumnDef<T, unknown> = {
        id: '_select',
        enableSorting: false,
        enableHiding: false,
        size: 32,
        header: () => {
          const allIds = data.map((d) => String((d as EntryRow).id))
          const allSelected = allIds.length > 0 && allIds.every((id) => selectedRowIds?.has(id))
          return (
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => {
                if (checked) {
                  const next = new Set(selectedRowIds)
                  allIds.forEach((id) => next.add(id))
                  onSelectionChange?.(next)
                } else {
                  const next = new Set(selectedRowIds)
                  allIds.forEach((id) => next.delete(id))
                  onSelectionChange?.(next)
                }
              }}
            />
          )
        },
        cell: ({ row }) => {
          const id = String((row.original as EntryRow).id)
          return (
            <Checkbox
              checked={selectedRowIds?.has(id) ?? false}
              onCheckedChange={(checked) => {
                const next = new Set(selectedRowIds)
                if (checked) next.add(id)
                else next.delete(id)
                onSelectionChange?.(next)
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )
        },
      }
      cols.push(checkCol)
    }

    cols.push(...columns)
    return cols
  }, [selectable, columns, data, page, limit, selectedRowIds, onSelectionChange])

  const table = useReactTable({
    data,
    columns: augmentedColumns,
    state: {
      sorting,
      columnVisibility,
      columnPinning,
      columnSizing,
      columnOrder,
      ...(clientMode && globalFilterProp != null ? { globalFilter: globalFilterProp } : {}),
      ...(clientMode && columnFiltersProp ? { columnFilters: columnFiltersProp } : {}),
    },
    onColumnOrderChange: setColumnOrder,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      setSorting(next)
      onSortChange?.(next)
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater
      setColumnVisibility(next)
      onColumnVisibilityChangeProp?.(next)
    },
    onColumnPinningChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnPinning) : updater
      setColumnPinning(next)
      onColumnPinningChangeProp?.(next)
    },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    // In client mode, tanstack handles filtering/sorting/pagination.
    // In server mode, the server handles them (manual = true).
    manualPagination: !clientMode,
    manualSorting: !clientMode,
    manualFiltering: !clientMode,
    ...(clientMode
      ? {
          getFilteredRowModel: getFilteredRowModel(),
          getSortedRowModel: getSortedRowModel(),
          getPaginationRowModel: getPaginationRowModel(),
          globalFilterFn: 'includesString' as const,
        }
      : {}),
    columnResizeMode: 'onChange',
    pageCount: total && limit ? Math.ceil(total / limit) : -1,
  })

  // In client mode, use the filtered row count from tanstack.
  const effectiveTotal = clientMode
    ? table.getFilteredRowModel().rows.length
    : (total ?? 0)
  const totalPages = effectiveTotal && limit ? Math.ceil(effectiveTotal / limit) : 0
  const showingFrom = effectiveTotal ? (page - 1) * limit + 1 : 0
  const showingTo = Math.min(page * limit, effectiveTotal)

  // Grid navigation state.
  const visibleRows = table.getRowModel().rows
  const visibleCols = table.getVisibleFlatColumns()
  const colIds = useMemo(() => visibleCols.map((c) => c.id), [visibleCols])

  // Skip indices for non-data columns during tab navigation.
  const skipColIndices = useMemo(() => {
    const skip: number[] = []
    colIds.forEach((id, i) => {
      if (id === '_actions' || id === '_rowNum' || id === '_select') skip.push(i)
    })
    return skip
  }, [colIds])

  const totalGridRows = visibleRows.length + emptyRowCount

  const grid = useGridNavigation({
    rowCount: totalGridRows,
    colCount: colIds.length,
    skipColumns: skipColIndices,
    isEditing: isEditingCell,
    onStartEditing: editable ? onStartEditing : undefined,
    onClearCell: editable ? onClearCell : undefined,
  })

  // Auto-scroll during drag operations.
  const autoScroll = useAutoScroll(scrollRef)

  // Fill handle hook.
  const fillHandle = useFillHandle({
    activeCell: grid.activeCell,
    selection: grid.selection,
    data: data as Record<string, unknown>[],
    columnIds: colIds,
    fields: editableFields ?? [],
    readOnlyColumns: new Set(['_select', '_actions', '_rowNum', 'created_at', '_status']),
    containerRef: grid.containerRef,
    onFill: onFill ?? (() => {}),
    onFillIntoEmptyRows,
    onAutoScroll: autoScroll.update,
    onAutoScrollStop: autoScroll.stop,
  })

  // Cell drag move/copy hook.
  const cellDrag = useCellDragMove({
    activeCell: grid.activeCell,
    selection: grid.selection,
    data: data as Record<string, unknown>[],
    columnIds: colIds,
    fields: editableFields ?? [],
    readOnlyColumns: new Set(['_select', '_actions', '_rowNum', 'created_at', '_status']),
    onMove: onCellMove ?? (() => {}),
    onAutoScroll: autoScroll.update,
    onAutoScrollStop: autoScroll.stop,
  })

  // Clipboard: copy & paste.
  const handleClipboard = useCallback(
    async (e: React.KeyboardEvent) => {
      if (!grid.activeCell) return
      const isCtrl = e.ctrlKey || e.metaKey

      if (isCtrl && e.key === 'c') {
        const range = grid.selection ?? {
          startRow: grid.activeCell.row,
          startCol: grid.activeCell.col,
          endRow: grid.activeCell.row,
          endCol: grid.activeCell.col,
        }
        e.preventDefault()
        await copyToClipboard(data as EntryRow[], colIds, range)
      }

      if (isCtrl && e.key === 'v' && editable && onPaste) {
        e.preventDefault()
        try {
          const matrix = await pasteFromClipboard()
          if (matrix.length > 0) {
            onPaste(grid.activeCell.row, grid.activeCell.col, matrix)
          }
        } catch {
          // Clipboard read may fail if permission denied
        }
      }
    },
    [grid.activeCell, grid.selection, data, colIds, editable, onPaste],
  )

  // Cell right-click context menu state (for editable mode).
  const [cellMenu, setCellMenu] = useState<{
    x: number
    y: number
    rowIdx: number
    colIdx: number
  } | null>(null)

  // Column rename dialog state.
  const [renameCol, setRenameCol] = useState<{ id: string; label: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Header right-click context menu state.
  const [headerMenu, setHeaderMenu] = useState<{
    x: number
    y: number
    column: Column<T, unknown>
  } | null>(null)

  const handleHeaderContextMenu = useCallback(
    (e: React.MouseEvent, column: Column<T, unknown>) => {
      e.preventDefault()
      setHeaderMenu({ x: e.clientX, y: e.clientY, column })
    },
    [],
  )

  // Close context menu on click outside.
  useEffect(() => {
    if (!headerMenu) return
    const close = () => setHeaderMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
    }
  }, [headerMenu])

  // Combined keydown handler.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // When editing, route to editing handler first
      if (isEditingCell && onEditKeyDown) {
        onEditKeyDown(e)
        if (e.defaultPrevented) return
      }
      handleClipboard(e)
      grid.handleKeyDown(e)
    },
    [handleClipboard, grid.handleKeyDown, isEditingCell, onEditKeyDown],
  )

  // Clear grid state when data changes (page navigation).
  const prevDataRef = useRef(data)
  useEffect(() => {
    if (prevDataRef.current !== data) {
      prevDataRef.current = data
      grid.setActiveCell(null)
      grid.setSelection(null)
    }
  }, [data])

  // Column DnD reorder
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor),
  )

  const headerIds = useMemo(
    () => table.getVisibleFlatColumns().map((c) => c.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table.getVisibleFlatColumns().length, columnOrder],
  )

  const handleColumnDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const allIds = table.getVisibleFlatColumns().map((c) => c.id)
      const oldIndex = allIds.indexOf(String(active.id))
      const newIndex = allIds.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = [...allIds]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, String(active.id))
      setColumnOrder(newOrder)
    },
    [table],
  )

  // Virtual scrolling — only activate when row count exceeds threshold.
  const ROW_HEIGHT = 20
  const VIRTUAL_THRESHOLD = 40
  const useVirtual = totalGridRows > VIRTUAL_THRESHOLD
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)

  const getRowHeight = useCallback((index: number) => rowSizing[index] || ROW_HEIGHT, [rowSizing])
  const rowVirtualizer = useVirtualizer({
    count: totalGridRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: getRowHeight,
    overscan: 8,
    enabled: useVirtual,
  })

  // Re-measure when row sizes change.
  useEffect(() => {
    if (useVirtual) rowVirtualizer.measure()
  }, [rowSizing, useVirtual, rowVirtualizer])

  // Scroll active cell into view when navigating via keyboard.
  useEffect(() => {
    if (!useVirtual || !grid.activeCell) return
    rowVirtualizer.scrollToIndex(grid.activeCell.row, { align: 'auto' })
  }, [useVirtual, grid.activeCell, rowVirtualizer])

  // Formula bar: compute cell reference and display value.
  const formulaBarInfo = useMemo(() => {
    if (!editable || !grid.activeCell) return null
    const { row, col } = grid.activeCell
    // Count non-data columns before this col to compute letter index.
    const nonDataCols = new Set(['_rowNum', '_select', '_actions'])
    let dataColIdx = 0
    for (let i = 0; i < col; i++) {
      if (!nonDataCols.has(colIds[i])) dataColIdx++
    }
    if (nonDataCols.has(colIds[col])) return null
    const letter = colIndexToLetter(dataColIdx)
    const rowNum = (page - 1) * limit + row + 1
    const colId = colIds[col]
    const value = data[row] ? String((data[row] as Record<string, unknown>)[colId] ?? '') : ''
    return { ref: `${letter}${rowNum}`, value }
  }, [editable, grid.activeCell, colIds, data, page, limit])

  return (
    <div className="space-y-1">
      {/* Toolbar — hidden when content is piped to ExcelRibbon */}
      {(toolbar || toolbarRight) && <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">{toolbar}</div>
        {toolbarRight}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Settings2 className="h-4 w-4" />
            컬럼
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>표시할 컬럼</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  >
                    <span className="flex items-center justify-between w-full">
                      {String(col.columnDef.header ?? col.id)}
                      <button
                        type="button"
                        className="ml-2 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          const isPinned = col.getIsPinned()
                          if (isPinned) {
                            col.pin(false)
                          } else {
                            col.pin('left')
                          }
                        }}
                      >
                        {col.getIsPinned() ? (
                          <PinOffIcon className="h-3 w-3" />
                        ) : (
                          <PinIcon className="h-3 w-3" />
                        )}
                      </button>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}

      {/* Formula bar (Excel-style: NameBox | fx | value) */}
      {editable && (
        <div className="flex items-center border border-[#d4d4d4] bg-white h-[22px] text-[11px]">
          <div className="w-16 px-1.5 border-r border-[#d4d4d4] bg-[#e6e6e6] text-center font-medium text-[#333] flex items-center justify-center h-full select-none tabular-nums">
            {formulaBarInfo?.ref ?? ''}
          </div>
          <div className="w-6 border-r border-[#d4d4d4] flex items-center justify-center text-[#666] italic select-none h-full">
            fx
          </div>
          <div className="flex-1 px-1.5 truncate text-[#333] text-[12px]">
            {formulaBarInfo?.value ?? ''}
          </div>
        </div>
      )}

      {/* Select-all-filtered banner */}
      {selectable && selectedRowIds && data.length > 0 && (() => {
        const allPageIds = data.map((d) => String((d as EntryRow).id))
        const allPageSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedRowIds.has(id))
        if (allPageSelected && totalFiltered && totalFiltered > data.length && selectedRowIds.size < totalFiltered) {
          return (
            <div className="rounded-md border bg-primary/5 px-3 py-2 text-sm text-center mb-2">
              현재 페이지의 {data.length}건이 선택되었습니다.{' '}
              <button
                type="button"
                className="text-primary underline font-medium"
                onClick={() => onSelectAllFiltered?.()}
              >
                필터된 전체 {totalFiltered}건 모두 선택
              </button>
            </div>
          )
        }
        return null
      })()}

      <div className="relative">
      <div
        ref={(el) => {
          scrollRef.current = el
          ;(grid.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        }}
        className={`border border-[#d4d4d4] bg-white overflow-auto focus:outline-none ${useVirtual ? 'max-h-[calc(100vh-340px)]' : ''}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <Table style={{ width: table.getCenterTotalSize() }} role="grid" aria-rowcount={total ?? data.length}>
          <TableHeader role="rowgroup" className="bg-[#e6e6e6]">
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} role="row" className="hover:bg-transparent">
                <SortableContext items={headerIds} strategy={horizontalListSortingStrategy}>
                {group.headers.map((header, headerIdx) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  const isPinned = header.column.getIsPinned()
                  const pinnedLeftCols = columnPinning.left ?? []
                  const isLastPinnedLeft = isPinned === 'left' && headerIdx === pinnedLeftCols.length - 1 + (selectable ? 1 : 0)
                  const isSystemCol = header.column.id === '_select' || header.column.id === '_actions' || header.column.id === '_rowNum'

                  return (
                    <SortableTableHead
                      key={header.id}
                      id={header.column.id}
                      disabled={!!isPinned || isSystemCol}
                      role="columnheader"
                      aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : canSort ? 'none' : undefined}
                      className={`relative group ${isPinned ? 'bg-[#e6e6e6]' : ''} ${isLastPinnedLeft ? 'border-r-2 border-r-[#b0b0b0]' : ''}`}
                      style={{
                        width: header.getSize(),
                        position: isPinned ? 'sticky' : undefined,
                        left: isPinned === 'left' ? header.column.getStart('left') : undefined,
                        right: isPinned === 'right' ? header.column.getAfter('right') : undefined,
                        zIndex: isPinned ? 2 : undefined,
                      }}
                      onContextMenu={(e) => handleHeaderContextMenu(e, header.column)}
                      onMouseDown={!isSystemCol ? (e) => {
                        if (e.button !== 0) return
                        // Select entire column on click (don't conflict with sort/resize)
                        const target = e.target as HTMLElement
                        if (target.closest('.cursor-col-resize')) return
                        grid.selectColumn(headerIdx, e.shiftKey)
                        e.preventDefault()

                        // Support drag across headers
                        const handleHeaderDragMove = (ev: MouseEvent) => {
                          const el = document.elementFromPoint(ev.clientX, ev.clientY)
                          if (!el) return
                          const th = (el as HTMLElement).closest('[role="columnheader"]') as HTMLElement | null
                          if (!th) return
                          // Find the header index
                          const allHeaders = Array.from(th.parentElement?.children ?? [])
                          const idx = allHeaders.indexOf(th)
                          if (idx >= 0) grid.selectColumn(idx, true)
                        }
                        const handleHeaderDragUp = () => {
                          document.removeEventListener('mousemove', handleHeaderDragMove)
                          document.removeEventListener('mouseup', handleHeaderDragUp)
                        }
                        document.addEventListener('mousemove', handleHeaderDragMove)
                        document.addEventListener('mouseup', handleHeaderDragUp)
                      } : undefined}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={`flex items-center gap-1 ${canSort ? 'cursor-pointer hover:text-foreground' : ''}`}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          disabled={!canSort}
                        >
                          {isPinned && <PinIcon className="h-3 w-3 text-muted-foreground shrink-0" />}
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' && <span className="text-[8px] leading-none">▲</span>}
                          {sortDir === 'desc' && <span className="text-[8px] leading-none">▼</span>}
                          {canSort && !sortDir && (
                            <span className="text-[8px] leading-none opacity-0 group-hover:opacity-40 transition-opacity">▼</span>
                          )}
                        </button>
                      )}
                      {/* Resize handle */}
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-3 cursor-col-resize select-none touch-none group/resize"
                        style={{
                          transform: header.column.getIsResizing()
                            ? `translateX(${table.getState().columnSizingInfo.deltaOffset}px)`
                            : '',
                        }}
                      >
                        <div className="absolute right-0 top-1/4 h-1/2 w-px border-r border-dashed border-border group-hover/resize:border-foreground/50 transition-colors" />
                      </div>
                    </SortableTableHead>
                  )
                })}
                </SortableContext>
                {columnManagement && onAddColumn && (
                  <TableHead
                    className="w-10 min-w-[40px] border-b px-0 text-center"
                  >
                    <button
                      type="button"
                      className="flex h-full w-full items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                      onClick={onAddColumn}
                      title="열 추가"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </TableHead>
                )}
              </TableRow>
            ))}
            </DndContext>
          </TableHeader>
          <TableBody
            ref={tableBodyRef}
            role="rowgroup"
            style={useVirtual ? { height: rowVirtualizer.getTotalSize() + (showNewRow && emptyRowCount === 0 ? ROW_HEIGHT : 0), position: 'relative' } : undefined}
          >
            {visibleRows.length === 0 && emptyRowCount === 0 ? (
              <TableRow role="row">
                <TableCell role="gridcell" colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} variant={emptyVariant} />
                </TableCell>
              </TableRow>
            ) : (
              (useVirtual ? rowVirtualizer.getVirtualItems() : Array.from({ length: totalGridRows }, (_, i) => ({ index: i, start: 0, size: getRowHeight(i) }))).map((virtualItem) => {
                const rowIdx = virtualItem.index
                const isEmptyGridRow = rowIdx >= visibleRows.length

                // --- Empty row rendering ---
                if (isEmptyGridRow) {
                  const emptyRowNum = (page - 1) * limit + rowIdx + 1
                  return (
                    <TableRow
                      key={`_empty_${rowIdx}`}
                      role="row"
                      aria-rowindex={emptyRowNum + 1}
                      className="hover:bg-[#d6e4f0]/10"
                      style={useVirtual ? {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      } : undefined}
                    >
                      {table.getVisibleFlatColumns().map((col, colIdx) => {
                        const isRowNum = col.id === '_rowNum'
                        const isSystem = col.id === '_select' || col.id === '_actions' || col.id === '_status' || col.id === 'created_at'
                        const isActive = grid.activeCell?.row === rowIdx && grid.activeCell?.col === colIdx
                        const isSelected = isCellInRange(rowIdx, colIdx, grid.selection)
                        const isPinned = col.getIsPinned()

                        // Fill preview edge flags for empty rows
                        const fp = fillHandle.fillPreview
                        const inFillPreview = fp && rowIdx >= fp.startRow && rowIdx <= fp.endRow && colIdx >= fp.startCol && colIdx <= fp.endCol
                        const fpTop = inFillPreview && rowIdx === fp.startRow
                        const fpBottom = inFillPreview && rowIdx === fp.endRow
                        const fpLeft = inFillPreview && colIdx === fp.startCol
                        const fpRight = inFillPreview && colIdx === fp.endCol

                        // Selection edge flags
                        const sel = grid.selection
                        const selNorm = sel ? {
                          r1: Math.min(sel.startRow, sel.endRow),
                          r2: Math.max(sel.startRow, sel.endRow),
                          c1: Math.min(sel.startCol, sel.endCol),
                          c2: Math.max(sel.startCol, sel.endCol),
                        } : null
                        const inSel = isSelected && selNorm
                        const edgeTop = inSel && rowIdx === selNorm.r1
                        const edgeBottom = inSel && rowIdx === selNorm.r2
                        const edgeLeft = inSel && colIdx === selNorm.c1
                        const edgeRight = inSel && colIdx === selNorm.c2

                        return (
                          <TableCell
                            key={col.id}
                            role="gridcell"
                            data-row={rowIdx}
                            data-col={colIdx}
                            className={`${isRowNum ? 'bg-[#e6e6e6] border-r border-r-stone-300 text-center' : isPinned ? 'bg-background' : ''} relative ${isActive && !isRowNum ? 'grid-cell-active' : ''} ${isSelected && !isActive && !isRowNum ? 'bg-[#cce4f7]' : ''} ${edgeTop ? 'border-t-2 border-t-[#005a9e]' : ''} ${edgeBottom ? 'border-b-2 border-b-[#005a9e]' : ''} ${edgeLeft ? 'border-l-2 border-l-[#005a9e]' : ''} ${edgeRight ? 'border-r-2 border-r-[#005a9e]' : ''} ${inFillPreview ? 'fill-preview-bg' : ''} ${fpTop ? 'fill-preview-top' : ''} ${fpBottom ? 'fill-preview-bottom' : ''} ${fpLeft ? 'fill-preview-left' : ''} ${fpRight ? 'fill-preview-right' : ''}`}
                            style={{
                              width: col.getSize(),
                              position: isPinned ? 'sticky' : undefined,
                              left: isPinned === 'left' ? col.getStart('left') : undefined,
                              right: isPinned === 'right' ? col.getAfter('right') : undefined,
                              zIndex: isPinned ? 1 : undefined,
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              grid.handleCellClick(rowIdx, colIdx, e)
                            }}
                            onDoubleClick={(e) => {
                              if (editable && onStartEditing && !isSystem && !isRowNum) {
                                e.stopPropagation()
                                onStartEditing(rowIdx, colIdx, '')
                              }
                            }}
                          >
                            {isRowNum ? (
                              <span className="text-muted-foreground/40">{emptyRowNum}</span>
                            ) : isSystem ? null : editable && getFieldForCol && editingCell?.row === rowIdx && editingCell?.col === colIdx ? (
                              <GridCell
                                field={getFieldForCol(colIdx)}
                                value={null}
                                isEditing={true}
                                editValue={editValue}
                                onEditValueChange={onEditValueChange ?? (() => {})}
                                onCommit={onCommitEdit ?? (() => {})}
                                onCancel={onCancelEdit ?? (() => {})}
                                onKeyDown={onEditKeyDown ?? (() => {})}
                                saveState={null}
                                displayContent={null}
                              />
                            ) : null}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                }

                // --- Data row rendering ---
                const row = visibleRows[rowIdx]
                const rowId = String((row.original as EntryRow).id ?? row.id)
                const isNewRow = newRowId != null && rowId === newRowId
                return (
                <TableRow
                  key={row.id}
                  role="row"
                  aria-rowindex={(page - 1) * limit + rowIdx + 2}
                  className={`${onRowClick ? 'cursor-pointer' : ''} ${highlightRows > 0 && rowIdx < highlightRows ? 'animate-highlight-row' : ''} ${isNewRow ? 'animate-row-enter' : ''} ${(row.original as EntryRow)._optimistic ? 'opacity-60' : ''} hover:bg-[#d6e4f0]/30`}
                  style={useVirtual ? {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  } : { height: `${getRowHeight(rowIdx)}px` }}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell, colIdx) => {
                    const isPinned = cell.column.getIsPinned()
                    const isActive = grid.activeCell?.row === rowIdx && grid.activeCell?.col === colIdx
                    const isSelected = isCellInRange(rowIdx, colIdx, grid.selection)
                    const pinnedLeftCols = columnPinning.left ?? []
                    const isLastPinnedLeftCell = isPinned === 'left' && colIdx === pinnedLeftCols.length - 1 + (selectable ? 1 : 0)

                    // Compute selection edge flags for border outline.
                    const sel = grid.selection
                    const selNorm = sel ? {
                      r1: Math.min(sel.startRow, sel.endRow),
                      r2: Math.max(sel.startRow, sel.endRow),
                      c1: Math.min(sel.startCol, sel.endCol),
                      c2: Math.max(sel.startCol, sel.endCol),
                    } : null
                    const inSel = isSelected && selNorm
                    const edgeTop = inSel && rowIdx === selNorm.r1
                    const edgeBottom = inSel && rowIdx === selNorm.r2
                    const edgeLeft = inSel && colIdx === selNorm.c1
                    const edgeRight = inSel && colIdx === selNorm.c2

                    const isRowNum = cell.column.id === '_rowNum'

                    // Fill preview edge flags
                    const fp = fillHandle.fillPreview
                    const inFillPreview = fp && rowIdx >= fp.startRow && rowIdx <= fp.endRow && colIdx >= fp.startCol && colIdx <= fp.endCol
                    const fpTop = inFillPreview && rowIdx === fp.startRow
                    const fpBottom = inFillPreview && rowIdx === fp.endRow
                    const fpLeft = inFillPreview && colIdx === fp.startCol
                    const fpRight = inFillPreview && colIdx === fp.endCol

                    // Drag ghost edge flags
                    const dg = cellDrag.dragGhost
                    const inDragGhost = dg && rowIdx >= dg.startRow && rowIdx <= dg.endRow && colIdx >= dg.startCol && colIdx <= dg.endCol
                    const dgPrefix = dg?.mode === 'copy' ? 'drag-ghost-copy' : 'drag-ghost-move'
                    const dgTop = inDragGhost && rowIdx === dg.startRow
                    const dgBottom = inDragGhost && rowIdx === dg.endRow
                    const dgLeft = inDragGhost && colIdx === dg.startCol
                    const dgRight = inDragGhost && colIdx === dg.endCol

                    // Free grid dirty/error indicators
                    const rowId = String((row.original as EntryRow).id)
                    const isCellDirty = freeGridMode && cellDirtyFn && !isRowNum && cellDirtyFn(rowId, cell.column.id)
                    const cellError = freeGridMode && cellErrorFn && !isRowNum ? cellErrorFn(rowId, cell.column.id) : null

                    // Is this cell the bottom-right corner of the active cell/selection? (fill handle position)
                    const isFillHandleCell = editable && onFill && !isRowNum && (() => {
                      if (grid.selection) {
                        const sn = {
                          r2: Math.max(grid.selection.startRow, grid.selection.endRow),
                          c2: Math.max(grid.selection.startCol, grid.selection.endCol),
                        }
                        return rowIdx === sn.r2 && colIdx === sn.c2
                      }
                      return isActive
                    })()

                    return (
                      <TableCell
                        key={cell.id}
                        role="gridcell"
                        data-row={rowIdx}
                        data-col={colIdx}
                        className={`${isRowNum ? 'bg-[#e6e6e6] border-r border-r-stone-300 text-center' : isPinned ? 'bg-background' : ''} ${isLastPinnedLeftCell ? 'border-r-2 border-r-[#b0b0b0]' : ''} relative ${isActive && !isRowNum ? 'grid-cell-active' : ''} ${isSelected && !isActive && !isRowNum ? 'bg-[#cce4f7]' : ''} ${edgeTop ? 'border-t-2 border-t-[#005a9e]' : ''} ${edgeBottom ? 'border-b-2 border-b-[#005a9e]' : ''} ${edgeLeft ? 'border-l-2 border-l-[#005a9e]' : ''} ${edgeRight ? 'border-r-2 border-r-[#005a9e]' : ''} ${inFillPreview ? 'fill-preview-bg' : ''} ${fpTop ? 'fill-preview-top' : ''} ${fpBottom ? 'fill-preview-bottom' : ''} ${fpLeft ? 'fill-preview-left' : ''} ${fpRight ? 'fill-preview-right' : ''} ${inDragGhost ? 'drag-ghost-bg' : ''} ${dgTop ? `${dgPrefix}-top` : ''} ${dgBottom ? `${dgPrefix}-bottom` : ''} ${dgLeft ? `${dgPrefix}-left` : ''} ${dgRight ? `${dgPrefix}-right` : ''} ${cellError ? 'cell-error' : ''}`}
                        title={cellError ?? undefined}
                        style={{
                          width: cell.column.getSize(),
                          position: isPinned ? 'sticky' : undefined,
                          left: isPinned === 'left' ? cell.column.getStart('left') : undefined,
                          right: isPinned === 'right' ? cell.column.getAfter('right') : undefined,
                          zIndex: isPinned ? 1 : undefined,
                        }}
                        onMouseMove={editable && onCellMove ? (e) => cellDrag.handleCellMouseMove(e, rowIdx, colIdx) : undefined}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return
                          // Row number click → select entire row
                          if (isRowNum) {
                            grid.selectRow(rowIdx, e.shiftKey)
                            e.preventDefault()
                            // Support drag across row numbers
                            const handleRowDragMove = (ev: MouseEvent) => {
                              const el = document.elementFromPoint(ev.clientX, ev.clientY)
                              if (!el) return
                              const cell = (el as HTMLElement).closest('[data-row]') as HTMLElement | null
                              if (!cell) return
                              const r = parseInt(cell.dataset.row ?? '', 10)
                              if (!isNaN(r)) grid.selectRow(r, true)
                            }
                            const handleRowDragUp = () => {
                              document.removeEventListener('mousemove', handleRowDragMove)
                              document.removeEventListener('mouseup', handleRowDragUp)
                            }
                            document.addEventListener('mousemove', handleRowDragMove)
                            document.addEventListener('mouseup', handleRowDragUp)
                            return
                          }
                          // Priority 1: cell drag (move/copy) — near border of selected cell
                          if (editable && onCellMove) {
                            cellDrag.handleCellMouseDown(e, rowIdx, colIdx)
                            if (e.defaultPrevented) return
                          }
                          // Priority 2: drag-to-select — cell interior
                          grid.handleCellMouseDown(rowIdx, colIdx, e, autoScroll.update, autoScroll.stop)
                        }}
                        onClick={(e) => {
                          // Suppress click after drag
                          if (cellDrag.didDragRef.current) {
                            cellDrag.didDragRef.current = false
                            e.stopPropagation()
                            return
                          }
                          if (grid.didDragSelectRef.current) {
                            grid.didDragSelectRef.current = false
                            e.stopPropagation()
                            return
                          }
                          e.stopPropagation()
                          grid.handleCellClick(rowIdx, colIdx, e)
                        }}
                        onDoubleClick={(e) => {
                          if (editable && onStartEditing) {
                            e.stopPropagation()
                            onStartEditing(rowIdx, colIdx, '')
                          }
                        }}
                        onContextMenu={(e) => {
                          if (editable) {
                            e.preventDefault()
                            e.stopPropagation()
                            setCellMenu({ x: e.clientX, y: e.clientY, rowIdx, colIdx })
                          }
                        }}
                      >
                        {isCellDirty && (
                          <span className="absolute top-0 left-0 w-0 h-0 border-l-[5px] border-t-[5px] border-l-blue-500 border-t-blue-500 border-r-[5px] border-b-[5px] border-r-transparent border-b-transparent z-[1]" />
                        )}
                        {editable && getFieldForCol ? (
                          <GridCell
                            field={getFieldForCol(colIdx)}
                            value={(row.original as Record<string, unknown>)[cell.column.id]}
                            isEditing={editingCell?.row === rowIdx && editingCell?.col === colIdx}
                            editValue={editValue}
                            onEditValueChange={onEditValueChange ?? (() => {})}
                            onCommit={onCommitEdit ?? (() => {})}
                            onCancel={onCancelEdit ?? (() => {})}
                            onKeyDown={onEditKeyDown ?? (() => {})}
                            saveState={freeGridMode ? null : (cellSaveState?.get(`${(row.original as EntryRow).id}:${cell.column.id}`) ?? null)}
                            displayContent={flexRender(cell.column.columnDef.cell, cell.getContext())}
                          />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                        {isFillHandleCell && (
                          <div
                            className="fill-handle"
                            onMouseDown={fillHandle.handleFillHandleMouseDown}
                            onDoubleClick={fillHandle.handleFillHandleDoubleClick}
                          />
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
                )})
            )}
            {/* Bottom empty row for new entries (editable mode, DB mode only) */}
            {showNewRow && emptyRowCount === 0 && visibleRows.length > 0 && (
              <TableRow
                className="bg-muted/20 hover:bg-muted/40 border-t border-dashed"
                style={useVirtual ? {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${rowVirtualizer.getTotalSize()}px)`,
                } : undefined}
              >
                {table.getVisibleFlatColumns().map((col) => {
                  const isRowNum = col.id === '_rowNum'
                  const isSystem = col.id === '_select' || col.id === '_actions' || col.id === '_status' || col.id === 'created_at' || isRowNum
                  // Show "+ 새 항목" in first data column
                  const isFirstDataCol = !isSystem && table.getVisibleFlatColumns().findIndex((c) => {
                    const id = c.id
                    return id !== '_rowNum' && id !== '_select' && id !== '_actions' && id !== '_status' && id !== 'created_at'
                  }) === table.getVisibleFlatColumns().indexOf(col)
                  return (
                    <TableCell
                      key={col.id}
                      className={`text-muted-foreground ${isRowNum ? 'bg-[#e6e6e6]' : ''}`}
                      style={{ width: col.getSize() }}
                      onClick={() => {
                        if (!isSystem && onNewRowChange) {
                          // Focus the new row cell
                        }
                      }}
                    >
                      {isRowNum ? null : isFirstDataCol ? (
                        <span className="text-xs text-muted-foreground/60">+ 새 항목</span>
                      ) : isSystem ? null : (
                        <NewRowCell
                          field={editableFields?.find((f) => f.slug === col.id) ?? null}
                          value={newRowValues?.[col.id]}
                          onChange={(v) => onNewRowChange?.(col.id, v)}
                          onCommit={() => onNewRowCommit?.()}
                        />
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            )}
          </TableBody>
          {/* Summary row */}
          {summaryRow && Object.keys(summaryRow).length > 0 && (
            <TableFooter>
              <TableRow className="border-t-2 font-medium">
                {table.getVisibleFlatColumns().map((col) => {
                  const summary = summaryRow[col.id]
                  const currentFn = summaryFn?.[col.id] || 'sum'
                  const isRowNum = col.id === '_rowNum'
                  return (
                    <TableCell key={col.id} className={`text-xs py-1 ${isRowNum ? 'bg-[#e6e6e6]' : ''}`}>
                      {summary ? (
                        <div className="flex items-center gap-1.5">
                          {onSummaryFnChange && (
                            <Select
                              value={currentFn}
                              onValueChange={(v) => { if (v) onSummaryFnChange!(col.id, v) }}
                            >
                              <SelectTrigger className="h-6 w-[52px] text-[10px] px-1.5 border-dashed">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sum">합계</SelectItem>
                                <SelectItem value="avg">평균</SelectItem>
                                <SelectItem value="count">개수</SelectItem>
                                <SelectItem value="min">최소</SelectItem>
                                <SelectItem value="max">최대</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          <span className="font-semibold tabular-nums" title={String(summary.value)}>
                            {summary.label}
                          </span>
                        </div>
                      ) : null}
                    </TableCell>
                  )
                })}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent" />
      )}
      </div>

      {/* Status bar (Excel-like) */}
      {editable && (
        <StatusBar
          selection={grid.selection}
          activeCell={grid.activeCell}
          data={data as Record<string, unknown>[]}
          colIds={colIds}
          fields={editableFields}
        />
      )}

      {/* Header context menu (right-click) */}
      {headerMenu && (
        <div
          className="fixed z-50 min-w-[160px] border border-[#d4d4d4] bg-white p-0.5 text-[11px] shadow-sm"
          style={{ left: headerMenu.x, top: headerMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {headerMenu.column.getCanSort() && (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px]"
                onClick={() => {
                  onSortChange?.([{ id: headerMenu.column.id, desc: false }])
                  setHeaderMenu(null)
                }}
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                오름차순 정렬
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px]"
                onClick={() => {
                  onSortChange?.([{ id: headerMenu.column.id, desc: true }])
                  setHeaderMenu(null)
                }}
              >
                <ArrowDownUp className="h-3.5 w-3.5 rotate-180" />
                내림차순 정렬
              </button>
              <div className="my-0.5 h-px bg-[#d4d4d4]" />
            </>
          )}
          {headerMenu.column.getIsPinned() ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px]"
              onClick={() => {
                headerMenu.column.pin(false)
                setHeaderMenu(null)
              }}
            >
              <PinOffIcon className="h-3.5 w-3.5" />
              고정 해제
            </button>
          ) : (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px]"
                onClick={() => {
                  headerMenu.column.pin('left')
                  setHeaderMenu(null)
                }}
              >
                <PinIcon className="h-3.5 w-3.5" />
                왼쪽 고정
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px]"
                onClick={() => {
                  headerMenu.column.pin('right')
                  setHeaderMenu(null)
                }}
              >
                <PinIcon className="h-3.5 w-3.5 rotate-90" />
                오른쪽 고정
              </button>
            </>
          )}
          <div className="my-0.5 h-px bg-[#d4d4d4]" />
          {headerMenu.column.getCanHide() && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px]"
              onClick={() => {
                headerMenu.column.toggleVisibility(false)
                setHeaderMenu(null)
              }}
            >
              <Settings2 className="h-3.5 w-3.5" />
              숨기기
            </button>
          )}
          {columnManagement && onRenameColumn && headerMenu.column.id !== '_rowNum' && headerMenu.column.id !== '_select' && (
            <>
              <div className="my-0.5 h-px bg-[#d4d4d4]" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px]"
                onClick={() => {
                  const colId = headerMenu.column.id
                  const label = String(headerMenu.column.columnDef.header ?? colId)
                  setRenameCol({ id: colId, label })
                  setRenameValue(label)
                  setHeaderMenu(null)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                이름 변경
              </button>
              {onDeleteColumn && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px] text-destructive"
                  onClick={() => {
                    const colId = headerMenu.column.id
                    setHeaderMenu(null)
                    onDeleteColumn(colId)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Column rename inline dialog */}
      {renameCol && onRenameColumn && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setRenameCol(null)}
        >
          <div
            className="absolute left-1/2 top-1/3 z-50 -translate-x-1/2 rounded-lg border bg-popover p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-sm font-medium">열 이름 변경</div>
            <div className="flex gap-2">
              <input
                type="text"
                className="h-8 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameValue.trim()) {
                    onRenameColumn(renameCol.id, renameValue.trim())
                    setRenameCol(null)
                  }
                  if (e.key === 'Escape') setRenameCol(null)
                }}
                autoFocus
              />
              <Button
                size="sm"
                className="h-8"
                disabled={!renameValue.trim() || renameValue.trim() === renameCol.label}
                onClick={() => {
                  onRenameColumn(renameCol.id, renameValue.trim())
                  setRenameCol(null)
                }}
              >
                변경
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cell context menu (right-click, editable mode) */}
      {editable && cellMenu && (
        <GridContextMenu
          position={cellMenu}
          onCopy={async () => {
            const range = grid.selection ?? (grid.activeCell ? {
              startRow: grid.activeCell.row,
              startCol: grid.activeCell.col,
              endRow: grid.activeCell.row,
              endCol: grid.activeCell.col,
            } : null)
            if (range) {
              await copyToClipboard(data as EntryRow[], colIds, range)
            }
          }}
          onPaste={async () => {
            if (!grid.activeCell || !onPaste) return
            try {
              const matrix = await pasteFromClipboard()
              if (matrix.length > 0) {
                onPaste(grid.activeCell.row, grid.activeCell.col, matrix)
              }
            } catch { /* permission denied */ }
          }}
          onDeleteRow={() => {
            const row = visibleRows[cellMenu.rowIdx]
            if (row) {
              const rowId = String((row.original as EntryRow).id)
              onDeleteRow?.(rowId)
            }
          }}
          onClearCell={() => {
            onClearCell?.(cellMenu.rowIdx, cellMenu.colIdx)
          }}
          onClose={() => setCellMenu(null)}
          canDelete={!!onDeleteRow}
          onInsertRowAbove={onInsertRow ? () => onInsertRow() : undefined}
          onInsertRowBelow={onInsertRow ? () => onInsertRow() : undefined}
          onSortAscending={() => {
            const colId = colIds[cellMenu.colIdx]
            if (colId) onSortChange?.([{ id: colId, desc: false }])
          }}
          onSortDescending={() => {
            const colId = colIds[cellMenu.colIdx]
            if (colId) onSortChange?.([{ id: colId, desc: true }])
          }}
          onFilterByValue={onFilterByValue ? () => {
            const colId = colIds[cellMenu.colIdx]
            const value = (data[cellMenu.rowIdx] as Record<string, unknown>)?.[colId]
            if (colId) onFilterByValue(colId, value)
          } : undefined}
          cellValue={(data[cellMenu.rowIdx] as Record<string, unknown>)?.[colIds[cellMenu.colIdx]]}
          columnLabel={(() => {
            const col = table.getColumn(colIds[cellMenu.colIdx])
            return col ? String(col.columnDef.header ?? col.id) : undefined
          })()}
        />
      )}

      {/* Pagination footer */}
      {total !== undefined && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              {showingFrom}-{showingTo} / {total}건
            </span>
            {onLimitChange && (
              <Select
                value={String(limit)}
                onValueChange={(v) => {
                  onLimitChange(Number(v))
                  onPageChange?.(1)
                }}
              >
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}건
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => onPageChange?.(1)}
                disabled={page === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(page - 1)}
                disabled={page === 1}
              >
                이전
              </Button>
              {/* Page numbers: full on desktop, compact on mobile */}
              <span className="sm:hidden text-xs px-2">{page} / {totalPages}</span>
              <span className="hidden sm:contents">
                <PageNumbers page={page} totalPages={totalPages} onPageChange={onPageChange} />
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages}
              >
                다음
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => onPageChange?.(totalPages)}
                disabled={page >= totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Sortable header cell for column DnD reorder.
function SortableTableHead({
  id,
  disabled,
  children,
  className,
  style,
  ...props
}: {
  id: string
  disabled?: boolean
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
} & React.HTMLAttributes<HTMLTableCellElement>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const mergedStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <TableHead
      ref={setNodeRef}
      style={mergedStyle}
      className={className}
      {...props}
    >
      {!disabled && (
        <span
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 flex h-full w-2 cursor-grab items-center justify-center opacity-0 active:cursor-grabbing"
        />
      )}
      {children}
    </TableHead>
  )
}

// Simple inline input for new row cells.
function NewRowCell({
  field,
  value,
  onChange,
  onCommit,
}: {
  field: Field | null
  value: unknown
  onChange: (v: unknown) => void
  onCommit: () => void
}) {
  if (!field) return null

  // Only support simple types in the new row
  switch (field.field_type) {
    case 'text':
    case 'textarea':
      return (
        <input
          type="text"
          className="w-full bg-transparent border-none outline-none text-sm px-0 placeholder:text-muted-foreground/40"
          placeholder={field.label}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCommit()
            }
          }}
        />
      )
    case 'number':
    case 'integer':
      return (
        <input
          type="number"
          className="w-full bg-transparent border-none outline-none text-sm px-0 placeholder:text-muted-foreground/40 [&::-webkit-inner-spin-button]:appearance-none"
          placeholder={field.label}
          value={value != null ? String(value) : ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') onChange(null)
            else onChange(field.field_type === 'integer' ? parseInt(raw, 10) : parseFloat(raw))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCommit()
            }
          }}
        />
      )
    default:
      return <span className="text-xs text-muted-foreground/40">{field.label}</span>
  }
}

// Excel-like status bar with selection info and numeric aggregates.
function StatusBar({
  selection,
  activeCell,
  data,
  colIds,
  fields,
}: {
  selection: { startRow: number; startCol: number; endRow: number; endCol: number } | null
  activeCell: CellPosition | null
  data: Record<string, unknown>[]
  colIds: string[]
  fields?: Field[]
}) {
  const stats = useMemo(() => {
    if (!selection) return null
    const r1 = Math.min(selection.startRow, selection.endRow)
    const r2 = Math.max(selection.startRow, selection.endRow)
    const c1 = Math.min(selection.startCol, selection.endCol)
    const c2 = Math.max(selection.startCol, selection.endCol)
    const rows = r2 - r1 + 1
    const cols = c2 - c1 + 1

    // Collect numeric values from selected cells.
    const numericTypes = new Set(['number', 'integer', 'decimal'])
    const nums: number[] = []
    for (let r = r1; r <= r2; r++) {
      const row = data[r]
      if (!row) continue
      for (let c = c1; c <= c2; c++) {
        const colId = colIds[c]
        if (!colId) continue
        const field = fields?.find((f) => f.slug === colId)
        if (!field || !numericTypes.has(field.field_type)) continue
        const v = row[colId]
        if (v != null && typeof v === 'number' && !isNaN(v)) nums.push(v)
        else if (v != null && typeof v === 'string') {
          const n = parseFloat(v)
          if (!isNaN(n)) nums.push(n)
        }
      }
    }

    let sum = 0
    let avg = 0
    if (nums.length > 0) {
      sum = nums.reduce((a, b) => a + b, 0)
      avg = sum / nums.length
    }

    return { rows, cols, nums, sum, avg }
  }, [selection, data, colIds, fields])

  if (!selection && !activeCell) return null

  return (
    <div className="flex items-center gap-4 text-[11px] text-[#333] bg-[#e6e6e6] border border-[#d4d4d4] px-3 h-[22px]">
      <span className="text-[#666] mr-auto">준비</span>
      {stats && (
        <>
          <span className="text-[#666]">{stats.rows}행 x {stats.cols}열</span>
          {stats.nums.length > 0 && (
            <>
              <span className="text-[#c0c0c0]">|</span>
              <span>합계: <strong className="text-[#333] tabular-nums">{stats.sum.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</strong></span>
              <span>평균: <strong className="text-[#333] tabular-nums">{stats.avg.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</strong></span>
              <span>개수: <strong className="text-[#333] tabular-nums">{stats.nums.length}</strong></span>
            </>
          )}
        </>
      )}
    </div>
  )
}

// Renders a compact set of page number buttons around the current page.
function PageNumbers({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange?: (p: number) => void
}) {
  const pages: (number | '...')[] = []
  const delta = 2
  const rangeStart = Math.max(2, page - delta)
  const rangeEnd = Math.min(totalPages - 1, page + delta)

  pages.push(1)
  if (rangeStart > 2) pages.push('...')
  for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i)
  if (rangeEnd < totalPages - 1) pages.push('...')
  if (totalPages > 1) pages.push(totalPages)

  return (
    <>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-1">
            ...
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange?.(p)}
          >
            {p}
          </Button>
        ),
      )}
    </>
  )
}
