import {
  type Column,
  type ColumnDef,
  type ColumnPinningState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
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
import { isCellInRange, useGridNavigation } from '@/hooks/useGridNavigation'
import { buildPasteUpdates, copyToClipboard, parseTSV } from '@/lib/clipboard'
import { PAGE_SIZE_OPTIONS } from '@/lib/constants'

import { Checkbox } from '@/components/ui/checkbox'

import EmptyState from './EmptyState'
import GridCell from './GridCell'

export interface CellEditEvent {
  rowId: string
  columnId: string
  value: unknown
}

export interface BatchCellEditEvent {
  updates: { rowId: string; columnId: string; value: unknown }[]
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
  onCellEdit?: (event: CellEditEvent) => void
  onBatchCellEdit?: (event: BatchCellEditEvent) => void
  /** Column IDs that are not editable (system columns, actions, etc.) */
  readonlyColumns?: string[]
  /** Per-cell save state for visual feedback (key = "rowId:columnId") */
  cellSaveState?: Map<string, 'saving' | 'saved'>
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
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
  /** Enable row selection with checkboxes */
  selectable?: boolean
  /** Currently selected row IDs (controlled) */
  selectedRowIds?: Set<string>
  /** Called when selection changes */
  onSelectionChange?: (ids: Set<string>) => void
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
  onCellEdit,
  onBatchCellEdit,
  readonlyColumns,
  cellSaveState,
  emptyTitle = '데이터가 없습니다',
  emptyDescription,
  emptyAction,
  summaryRow,
  summaryFn,
  onSummaryFnChange,
  toolbar,
  initialColumnVisibility,
  onColumnVisibilityChange: onColumnVisibilityChangeProp,
  highlightRows = 0,
  newRowId,
  selectable,
  selectedRowIds,
  onSelectionChange,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility ?? {})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: [],
    right: [],
  })
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({})

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
        const allIds = data.map((d) => String((d as Record<string, unknown>).id))
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
        const id = String((row.original as Record<string, unknown>).id)
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
    state: { sorting, columnVisibility, columnPinning, columnSizing },
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
    onColumnPinningChange: setColumnPinning,
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

  const readonlySet = useMemo(() => {
    const s = new Set(readonlyColumns ?? [])
    // System columns are always readonly.
    for (const id of colIds) {
      if (id.startsWith('_') || id === 'created_at') s.add(id)
    }
    return s
  }, [readonlyColumns, colIds])

  const editableSet = useMemo(() => {
    const s = new Set<string>()
    for (const id of colIds) {
      if (!readonlySet.has(id)) s.add(id)
    }
    return s
  }, [colIds, readonlySet])

  // Skip indices for non-editable action columns during tab navigation.
  const skipColIndices = useMemo(() => {
    const skip: number[] = []
    colIds.forEach((id, i) => {
      if (id === '_actions') skip.push(i)
    })
    return skip
  }, [colIds])

  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const isEditing = editingCell !== null

  const handleEditStart = useCallback(
    (row: number, col: number) => {
      const colId = colIds[col]
      if (!colId || readonlySet.has(colId)) return
      if (!onCellEdit) return
      setEditingCell({ row, col })
    },
    [colIds, readonlySet, onCellEdit],
  )

  const handleEditCommit = useCallback(() => {
    // Commit is handled by GridCell's blur/Enter.
    setEditingCell(null)
  }, [])

  const handleEditCancel = useCallback(() => {
    setEditingCell(null)
  }, [])

  const grid = useGridNavigation({
    rowCount: visibleRows.length,
    colCount: colIds.length,
    onEditStart: handleEditStart,
    onEditCommit: handleEditCommit,
    onEditCancel: handleEditCancel,
    isEditing,
    skipColumns: skipColIndices,
  })

  // Clipboard: copy / paste.
  const handleClipboard = useCallback(
    async (e: React.KeyboardEvent) => {
      if (!grid.activeCell) return
      const isCtrl = e.ctrlKey || e.metaKey

      // Copy.
      if (isCtrl && e.key === 'c') {
        const range = grid.selection ?? {
          startRow: grid.activeCell.row,
          startCol: grid.activeCell.col,
          endRow: grid.activeCell.row,
          endCol: grid.activeCell.col,
        }
        e.preventDefault()
        await copyToClipboard(data as Record<string, unknown>[], colIds, range)
        return
      }

      // Paste.
      if (isCtrl && e.key === 'v' && (onCellEdit || onBatchCellEdit)) {
        e.preventDefault()
        try {
          const text = await navigator.clipboard.readText()
          const parsed = parseTSV(text)
          if (parsed.length === 0) return

          const updates = buildPasteUpdates(
            parsed,
            data as Record<string, unknown>[],
            colIds,
            grid.activeCell.row,
            grid.activeCell.col,
            editableSet,
          )

          if (updates.length === 0) return

          if (onBatchCellEdit && updates.length > 1) {
            onBatchCellEdit({ updates })
          } else {
            // Fall back to individual edits.
            for (const u of updates) {
              onCellEdit?.({ rowId: u.rowId, columnId: u.columnId, value: u.value })
            }
          }
        } catch {
          // Clipboard access denied — ignore.
        }
      }
    },
    [grid.activeCell, grid.selection, data, colIds, editableSet, onCellEdit, onBatchCellEdit],
  )

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
      handleClipboard(e)
      grid.handleKeyDown(e)
    },
    [handleClipboard, grid.handleKeyDown],
  )

  // Clear grid state when data changes (page navigation).
  const prevDataRef = useRef(data)
  useEffect(() => {
    if (prevDataRef.current !== data) {
      prevDataRef.current = data
      grid.setActiveCell(null)
      grid.setSelection(null)
      setEditingCell(null)
    }
  }, [data])

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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative">
      <div
        ref={(el) => {
          scrollRef.current = el
          ;(grid.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        }}
        className="rounded-md border overflow-auto focus:outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <Table style={{ width: table.getCenterTotalSize() }}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header, headerIdx) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  const isPinned = header.column.getIsPinned()
                  // Check if this is the last pinned-left column to draw a separator.
                  const pinnedLeftCols = columnPinning.left ?? []
                  const isLastPinnedLeft = isPinned === 'left' && headerIdx === pinnedLeftCols.length - 1 + (selectable ? 1 : 0)

                  return (
                    <TableHead
                      key={header.id}
                      className={`relative group ${isPinned ? 'bg-background' : ''} ${isLastPinnedLeft ? 'border-r-2 border-r-border' : ''}`}
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
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row, rowIdx) => {
                const rowId = String((row.original as Record<string, unknown>).id ?? row.id)
                const isNewRow = newRowId != null && rowId === newRowId
                return (
                <TableRow
                  key={row.id}
                  className={`${onRowClick && !onCellEdit ? 'cursor-pointer' : ''} ${highlightRows > 0 && rowIdx < highlightRows ? 'animate-highlight-row' : ''} ${isNewRow ? 'animate-row-enter' : ''} ${(row.original as Record<string, unknown>)._optimistic ? 'opacity-60' : ''}`}
                  onClick={() => {
                    // Only trigger row click if no cell is active (user clicking outside grid cells).
                    if (!grid.activeCell && onRowClick) {
                      onRowClick(row.original)
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell, colIdx) => {
                    const isPinned = cell.column.getIsPinned()
                    const isActive = grid.activeCell?.row === rowIdx && grid.activeCell?.col === colIdx
                    const isSelected = isCellInRange(rowIdx, colIdx, grid.selection)
                    const isCellEditing = editingCell?.row === rowIdx && editingCell?.col === colIdx
                    const colId = cell.column.id
                    const editable = !!onCellEdit && editableSet.has(colId)
                    const pinnedLeftCols = columnPinning.left ?? []
                    const isLastPinnedLeftCell = isPinned === 'left' && colIdx === pinnedLeftCols.length - 1 + (selectable ? 1 : 0)

                    return (
                      <TableCell
                        key={cell.id}
                        className={`${isPinned ? 'bg-background' : ''} ${isLastPinnedLeftCell ? 'border-r-2 border-r-border' : ''}`}
                        style={{
                          width: cell.column.getSize(),
                          position: isPinned ? 'sticky' : undefined,
                          left: isPinned === 'left' ? cell.column.getStart('left') : undefined,
                          right: isPinned === 'right' ? cell.column.getAfter('right') : undefined,
                          zIndex: isPinned ? 1 : undefined,
                        }}
                      >
                        {onCellEdit ? (() => {
                          const cellRowId = String((row.original as Record<string, unknown>).id ?? row.id)
                          const cellKey = `${cellRowId}:${colId}`
                          const saveState = cellSaveState?.get(cellKey)
                          return (
                          <GridCell
                            rawValue={(row.original as Record<string, unknown>)[colId]}
                            columnId={colId}
                            rowId={cellRowId}
                            isActive={isActive}
                            isSelected={isSelected}
                            isEditing={isCellEditing}
                            editable={editable}
                            saving={saveState === 'saving'}
                            saved={saveState === 'saved'}
                            onSave={(value) => {
                              onCellEdit({
                                rowId: cellRowId,
                                columnId: colId,
                                value,
                              })
                            }}
                            onEditStart={() => handleEditStart(rowIdx, colIdx)}
                            onEditCancel={handleEditCancel}
                            onClick={(e) => grid.handleCellClick(rowIdx, colIdx, e)}
                            onDoubleClick={() => handleEditStart(rowIdx, colIdx)}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </GridCell>
                          )})() : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
                )})
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
