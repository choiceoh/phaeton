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
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  GripVertical,
  PinIcon,
  PinOffIcon,
  Settings2,
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
import type { CellSaveState } from '@/hooks/useInlineEditing'
import { copyToClipboard, pasteFromClipboard } from '@/lib/clipboard'
import { PAGE_SIZE_OPTIONS } from '@/lib/constants'

import { Checkbox } from '@/components/ui/checkbox'

import EmptyState from './EmptyState'
import GridCell from './GridCell'
import GridContextMenu from './GridContextMenu'
import type { EntryRow, Field } from '@/lib/types'

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
  /** Show the bottom empty row for new entries. */
  showNewRow?: boolean
  /** Current values in the new row. */
  newRowValues?: Record<string, unknown>
  /** Called when a field in the new row changes. */
  onNewRowChange?: (fieldSlug: string, value: unknown) => void
  /** Called to commit the new row. */
  onNewRowCommit?: () => void
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
  showNewRow,
  newRowValues,
  onNewRowChange,
  onNewRowCommit,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility ?? {})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(
    initialColumnPinning ?? { left: [], right: [] },
  )
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({})
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

  // Prepend checkbox column when selectable.
  const augmentedColumns = useMemo(() => {
    if (!selectable) return columns
    const checkCol: ColumnDef<T, unknown> = {
      id: '_select',
      enableSorting: false,
      enableHiding: false,
      size: 40,
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
    return [checkCol, ...columns]
  }, [selectable, columns, data, selectedRowIds, onSelectionChange])

  const table = useReactTable({
    data,
    columns: augmentedColumns,
    state: { sorting, columnVisibility, columnPinning, columnSizing, columnOrder },
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
    manualPagination: true,
    manualSorting: true,
    columnResizeMode: 'onChange',
    pageCount: total && limit ? Math.ceil(total / limit) : -1,
  })

  const totalPages = total && limit ? Math.ceil(total / limit) : 0
  const showingFrom = total ? (page - 1) * limit + 1 : 0
  const showingTo = Math.min(page * limit, total ?? 0)

  // Grid navigation state.
  const visibleRows = table.getRowModel().rows
  const visibleCols = table.getVisibleFlatColumns()
  const colIds = useMemo(() => visibleCols.map((c) => c.id), [visibleCols])

  // Skip indices for action columns during tab navigation.
  const skipColIndices = useMemo(() => {
    const skip: number[] = []
    colIds.forEach((id, i) => {
      if (id === '_actions') skip.push(i)
    })
    return skip
  }, [colIds])

  const grid = useGridNavigation({
    rowCount: visibleRows.length,
    colCount: colIds.length,
    skipColumns: skipColIndices,
    isEditing: isEditingCell,
    onStartEditing: editable ? onStartEditing : undefined,
    onClearCell: editable ? onClearCell : undefined,
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
  const ROW_HEIGHT = 41
  const VIRTUAL_THRESHOLD = 40
  const useVirtual = visibleRows.length > VIRTUAL_THRESHOLD
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    enabled: useVirtual,
  })

  // Scroll active cell into view when navigating via keyboard.
  useEffect(() => {
    if (!useVirtual || !grid.activeCell) return
    rowVirtualizer.scrollToIndex(grid.activeCell.row, { align: 'auto' })
  }, [useVirtual, grid.activeCell, rowVirtualizer])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">{toolbar}</div>
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
      </div>

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
        className={`rounded-lg border border-stone-200/80 bg-white shadow-sm overflow-auto focus:outline-none ${useVirtual ? 'max-h-[calc(100vh-280px)]' : ''}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <Table style={{ width: table.getCenterTotalSize() }} role="grid" aria-rowcount={total ?? data.length}>
          <TableHeader role="rowgroup" className="bg-stone-50/80">
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
                  const isSystemCol = header.column.id === '_select' || header.column.id === '_actions'

                  return (
                    <SortableTableHead
                      key={header.id}
                      id={header.column.id}
                      disabled={!!isPinned || isSystemCol}
                      role="columnheader"
                      aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : canSort ? 'none' : undefined}
                      className={`relative group ${isPinned ? 'bg-stone-50' : ''} ${isLastPinnedLeft ? 'border-r-2 border-r-border' : ''}`}
                      style={{
                        width: header.getSize(),
                        position: isPinned ? 'sticky' : undefined,
                        left: isPinned === 'left' ? header.column.getStart('left') : undefined,
                        right: isPinned === 'right' ? header.column.getAfter('right') : undefined,
                        zIndex: isPinned ? 2 : undefined,
                      }}
                      onContextMenu={(e) => handleHeaderContextMenu(e, header.column)}
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
                          {sortDir === 'asc' && <ChevronUp className="h-3 w-3" />}
                          {sortDir === 'desc' && <ChevronDown className="h-3 w-3" />}
                          {canSort && !sortDir && (
                            <ArrowDownUp className="h-3 w-3 opacity-30 group-hover:opacity-70 transition-opacity" />
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
              </TableRow>
            ))}
            </DndContext>
          </TableHeader>
          <TableBody
            ref={tableBodyRef}
            role="rowgroup"
            style={useVirtual ? { height: rowVirtualizer.getTotalSize() + (showNewRow ? ROW_HEIGHT : 0), position: 'relative' } : undefined}
          >
            {visibleRows.length === 0 ? (
              <TableRow role="row">
                <TableCell role="gridcell" colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} variant={emptyVariant} />
                </TableCell>
              </TableRow>
            ) : (
              (useVirtual ? rowVirtualizer.getVirtualItems() : visibleRows.map((_, i) => ({ index: i, start: 0, size: ROW_HEIGHT }))).map((virtualItem) => {
                const rowIdx = virtualItem.index
                const row = visibleRows[rowIdx]
                const rowId = String((row.original as EntryRow).id ?? row.id)
                const isNewRow = newRowId != null && rowId === newRowId
                return (
                <TableRow
                  key={row.id}
                  role="row"
                  aria-rowindex={(page - 1) * limit + rowIdx + 2}
                  className={`${onRowClick ? 'cursor-pointer' : ''} ${highlightRows > 0 && rowIdx < highlightRows ? 'animate-highlight-row' : ''} ${isNewRow ? 'animate-row-enter' : ''} ${(row.original as EntryRow)._optimistic ? 'opacity-60' : ''} hover:bg-muted/60`}
                  style={useVirtual ? {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  } : undefined}
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

                    return (
                      <TableCell
                        key={cell.id}
                        role="gridcell"
                        className={`${isPinned ? 'bg-background' : ''} ${isLastPinnedLeftCell ? 'border-r-2 border-r-border' : ''} relative ${isActive ? 'ring-2 ring-primary ring-inset' : ''} ${edgeTop ? 'border-t-2 border-t-primary' : ''} ${edgeBottom ? 'border-b-2 border-b-primary' : ''} ${edgeLeft ? 'border-l-2 border-l-primary' : ''} ${edgeRight ? 'border-r-2 border-r-primary' : ''}`}
                        style={{
                          width: cell.column.getSize(),
                          position: isPinned ? 'sticky' : undefined,
                          left: isPinned === 'left' ? cell.column.getStart('left') : undefined,
                          right: isPinned === 'right' ? cell.column.getAfter('right') : undefined,
                          zIndex: isPinned ? 1 : undefined,
                        }}
                        onClick={(e) => {
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
                            saveState={cellSaveState?.get(`${(row.original as EntryRow).id}:${cell.column.id}`) ?? null}
                            displayContent={flexRender(cell.column.columnDef.cell, cell.getContext())}
                          />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
                )})
            )}
            {/* Bottom empty row for new entries (editable mode) */}
            {showNewRow && visibleRows.length > 0 && (
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
                {table.getVisibleFlatColumns().map((col, colIdx) => {
                  const isSystem = col.id === '_select' || col.id === '_actions' || col.id === '_status' || col.id === 'created_at'
                  return (
                    <TableCell
                      key={col.id}
                      className="text-muted-foreground"
                      style={{ width: col.getSize() }}
                      onClick={() => {
                        if (!isSystem && onNewRowChange) {
                          // Focus the new row cell
                        }
                      }}
                    >
                      {colIdx === 0 && !isSystem ? (
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
              <TableRow className="border-t-2 bg-muted/30 font-medium">
                {table.getVisibleFlatColumns().map((col, i) => {
                  const summary = summaryRow[col.id]
                  const currentFn = summaryFn?.[col.id] || 'sum'
                  return (
                    <TableCell key={col.id} className="text-xs py-1.5">
                      {i === 0 && !summary ? (
                        <span className="text-muted-foreground font-normal">집계</span>
                      ) : null}
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
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent rounded-r-md" />
      )}
      </div>

      {/* Selection indicator */}
      {grid.selection && (
        <div className="text-xs text-muted-foreground">
          {(() => {
            const r1 = Math.min(grid.selection.startRow, grid.selection.endRow)
            const r2 = Math.max(grid.selection.startRow, grid.selection.endRow)
            const c1 = Math.min(grid.selection.startCol, grid.selection.endCol)
            const c2 = Math.max(grid.selection.startCol, grid.selection.endCol)
            const rows = r2 - r1 + 1
            const cols = c2 - c1 + 1
            return `${rows}행 x ${cols}열 선택`
          })()}
        </div>
      )}

      {/* Header context menu (right-click) */}
      {headerMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border bg-popover p-1 text-sm shadow-md"
          style={{ left: headerMenu.x, top: headerMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {headerMenu.column.getIsPinned() ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
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
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
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
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
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
          <div className="my-1 h-px bg-border" />
          {headerMenu.column.getCanHide() && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              onClick={() => {
                headerMenu.column.toggleVisibility(false)
                setHeaderMenu(null)
              }}
            >
              <Settings2 className="h-3.5 w-3.5" />
              컬럼 숨기기
            </button>
          )}
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
          className="absolute left-0 top-0 flex h-full w-4 cursor-grab items-center justify-center opacity-0 group-hover:opacity-60 transition-opacity active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" />
        </span>
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
