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
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PAGE_SIZE_OPTIONS } from '@/lib/constants'

import EmptyState from './EmptyState'

export interface CellEditEvent {
  rowId: string
  columnId: string
  value: unknown
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
  emptyTitle?: string
  emptyDescription?: string
  summaryRow?: Record<string, { label: string; value: string | number }>
  toolbar?: React.ReactNode
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
  emptyTitle = '데이터가 없습니다',
  emptyDescription,
  summaryRow,
  toolbar,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: [],
    right: [],
  })
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({})

  const table = useReactTable({
    data,
    columns,
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

      <div className="rounded-md border overflow-auto">
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={onRowClick ? 'cursor-pointer' : ''}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isPinned = cell.column.getIsPinned()
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
                          <InlineEditCell
                            value={flexRender(cell.column.columnDef.cell, cell.getContext())}
                            rawValue={
                              (row.original as Record<string, unknown>)[cell.column.id]
                            }
                            columnId={cell.column.id}
                            rowId={String((row.original as Record<string, unknown>).id ?? row.id)}
                            onSave={onCellEdit}
                            onClick={(e) => e.stopPropagation()}
                          />
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
                        <span title={summary.label}>
                          {summary.label}: {summary.value}
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

// Inline edit cell: double-click to edit, Enter/blur to save.
function InlineEditCell({
  value,
  rawValue,
  columnId,
  rowId,
  onSave,
  onClick,
}: {
  value: React.ReactNode
  rawValue: unknown
  columnId: string
  rowId: string
  onSave: (event: CellEditEvent) => void
  onClick?: (e: React.MouseEvent) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = useCallback(() => {
    // Don't allow editing _actions or system columns
    if (columnId.startsWith('_')) return
    setEditValue(rawValue == null ? '' : String(rawValue))
    setEditing(true)
  }, [columnId, rawValue])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function commitEdit() {
    setEditing(false)
    const newValue = editValue === '' ? null : editValue
    if (String(rawValue ?? '') !== String(newValue ?? '')) {
      onSave({ rowId, columnId, value: newValue })
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        className="h-7 text-sm"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitEdit()
          if (e.key === 'Escape') setEditing(false)
        }}
        onClick={onClick}
      />
    )
  }

  return (
    <div onDoubleClick={startEdit} onClick={onClick}>
      {value}
    </div>
  )
}
