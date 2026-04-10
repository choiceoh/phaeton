import {
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
  emptyTitle?: string
  emptyDescription?: string
  summaryRow?: Record<string, { label: string; value: string | number }>
  toolbar?: React.ReactNode
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
  emptyTitle = '데이터가 없습니다',
  emptyDescription,
  summaryRow,
  toolbar,
  selectable,
  selectedRowIds,
  onSelectionChange,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: [],
    right: [],
  })
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({})

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
    onColumnVisibilityChange: setColumnVisibility,
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

      <div
        ref={grid.containerRef}
        className="rounded-md border overflow-auto focus:outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <Table style={{ width: table.getCenterTotalSize() }}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  const isPinned = header.column.getIsPinned()

                  return (
                    <TableHead
                      key={header.id}
                      className="relative group"
                      style={{
                        width: header.getSize(),
                        position: isPinned ? 'sticky' : undefined,
                        left: isPinned === 'left' ? header.column.getStart('left') : undefined,
                        right: isPinned === 'right' ? header.column.getAfter('right') : undefined,
                        zIndex: isPinned ? 1 : undefined,
                        backgroundColor: isPinned ? 'var(--background, #fff)' : undefined,
                      }}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={`flex items-center gap-1 ${canSort ? 'cursor-pointer hover:text-foreground' : ''}`}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          disabled={!canSort}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' && <ChevronUp className="h-3 w-3" />}
                          {sortDir === 'desc' && <ChevronDown className="h-3 w-3" />}
                          {canSort && !sortDir && (
                            <ArrowDownUp className="h-3 w-3 opacity-0 group-hover:opacity-30" />
                          )}
                        </button>
                      )}
                      {/* Resize handle */}
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/50 group-hover:bg-border"
                        style={{
                          transform: header.column.getIsResizing()
                            ? `translateX(${table.getState().columnSizingInfo.deltaOffset}px)`
                            : '',
                        }}
                      />
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
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row, rowIdx) => (
                <TableRow
                  key={row.id}
                  className={onRowClick && !onCellEdit ? 'cursor-pointer' : ''}
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

                    return (
                      <TableCell
                        key={cell.id}
                        style={{
                          width: cell.column.getSize(),
                          position: isPinned ? 'sticky' : undefined,
                          left: isPinned === 'left' ? cell.column.getStart('left') : undefined,
                          right: isPinned === 'right' ? cell.column.getAfter('right') : undefined,
                          zIndex: isPinned ? 1 : undefined,
                          backgroundColor: isPinned ? 'var(--background, #fff)' : undefined,
                        }}
                      >
                        {onCellEdit ? (
                          <GridCell
                            rawValue={(row.original as Record<string, unknown>)[colId]}
                            columnId={colId}
                            rowId={String((row.original as Record<string, unknown>).id ?? row.id)}
                            isActive={isActive}
                            isSelected={isSelected}
                            isEditing={isCellEditing}
                            editable={editable}
                            onSave={(value) => {
                              onCellEdit({
                                rowId: String((row.original as Record<string, unknown>).id ?? row.id),
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
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
          {/* Summary row */}
          {summaryRow && Object.keys(summaryRow).length > 0 && (
            <TableFooter>
              <TableRow className="bg-muted/50 font-medium">
                {table.getVisibleFlatColumns().map((col, i) => {
                  const summary = summaryRow[col.id]
                  return (
                    <TableCell key={col.id} className="text-xs">
                      {i === 0 && !summary ? '합계' : ''}
                      {summary ? (
                        <span title={String(summary.value)}>
                          {summary.label}
                        </span>
                      ) : null}
                    </TableCell>
                  )
                })}
              </TableRow>
            </TableFooter>
          )}
        </Table>
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

      {/* Pagination footer */}
      {total !== undefined && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
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
              {/* Page number buttons */}
              <PageNumbers page={page} totalPages={totalPages} onPageChange={onPageChange} />
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
