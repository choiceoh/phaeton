import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp, ChevronsLeft, ChevronsRight, Settings2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import EmptyState from './EmptyState'

interface Props<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  total?: number
  page?: number
  limit?: number
  onPageChange?: (page: number) => void
  onSortChange?: (sort: SortingState) => void
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
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
  onSortChange,
  onRowClick,
  emptyTitle = '데이터가 없습니다',
  emptyDescription,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      setSorting(next)
      onSortChange?.(next)
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: total && limit ? Math.ceil(total / limit) : -1,
  })

  const totalPages = total && limit ? Math.ceil(total / limit) : 0
  const showingFrom = total ? (page - 1) * limit + 1 : 0
  const showingTo = Math.min(page * limit, total ?? 0)

  return (
    <div className="space-y-3">
      {/* Toolbar — column visibility */}
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Settings2 className="h-4 w-4" />
            컬럼
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
                  {String(col.columnDef.header ?? col.id)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id}>
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
                        </button>
                      )}
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
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer */}
      {total !== undefined && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {showingFrom}-{showingTo} / {total}건
          </span>
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
              <span className="px-2">
                {page} / {totalPages}
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
