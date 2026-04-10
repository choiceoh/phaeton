import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  ArrowDownUp,
  Bookmark,
  BookmarkPlus,
  BarChart3,
  Calendar,
  Download,
  Filter,
  GanttChart,
  LayoutGrid,
  Power,
  PowerOff,
  Search,
  Trash2,
  Upload,
  X,
  Ellipsis,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import { type BatchCellEditEvent, type CellEditEvent, DataTable } from '@/components/common/DataTable'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import RoleGate from '@/components/common/RoleGate'
import EntrySheet from '@/components/works/EntrySheet'
import FilterBuilder from '@/components/works/FilterBuilder'
import SortPanel, { type SortItem } from '@/components/works/SortPanel'
import CalendarView from '@/components/works/views/CalendarView'
import ChartPanel from '@/components/works/views/ChartPanel'
import GalleryView from '@/components/works/views/GalleryView'
import GanttView from '@/components/works/views/GanttView'
import KanbanView from '@/components/works/views/KanbanView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCollection } from '@/hooks/useCollections'
import {
  useBatchUpdateEntry,
  useBulkDeleteEntries,
  useCreateEntry,
  useDeleteEntry,
  useEntries,
  useUpdateEntry,
} from '@/hooks/useEntries'
import { useProcess } from '@/hooks/useProcess'
import { useSavedViews, useCreateSavedView, useDeleteSavedView } from '@/hooks/useSavedViews'
import { useAutomationRunToasts } from '@/hooks/useAutomationRunToasts'
import { formatError } from '@/lib/api'
import { isLayoutType, TERM } from '@/lib/constants'
import { formatCell } from '@/lib/formatCell'
import type { FilterCondition, SavedView } from '@/lib/types'

const DEFAULT_LIMIT = 20

export default function AppViewPage() {
  const { appId } = useParams()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [sorting, setSorting] = useState<SortingState>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<Record<string, unknown> | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importedCount, setImportedCount] = useState(0)

  // Filter state
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([])

  // Sort panel state (separate from column header sorting)
  const [sortItems, setSortItems] = useState<SortItem[]>([])

  // Search state
  const [searchText, setSearchText] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  // Process toggle (frontend-only)
  const [processVisible, setProcessVisible] = useState(true)

  // Saved views state
  const [activeView, setActiveView] = useState<SavedView | null>(null)
  const [savingView, setSavingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  const { data: collection, isLoading: colLoading, isError: colError, error: colErr } =
    useCollection(appId)
  const { data: process } = useProcess(appId)

  // Show toast when automation runs are detected.
  useAutomationRunToasts(collection?.id)

  // Build expand string from all relation fields.
  const expand = useMemo(() => {
    if (!collection?.fields) return undefined
    const rels = collection.fields.filter((f) => f.field_type === 'relation').map((f) => f.slug)
    return rels.length > 0 ? rels.join(',') : undefined
  }, [collection])

  const { data: savedViews } = useSavedViews(collection?.id)
  const createSavedView = useCreateSavedView(collection?.id ?? '')
  const deleteSavedView = useDeleteSavedView(collection?.id ?? '')

  // Build sort param — only one source is active at a time.
  const sortParam = useMemo(() => {
    if (sortItems.length > 0) {
      return sortItems.map((s) => `${s.desc ? '-' : ''}${s.field}`).join(',')
    }
    if (sorting.length === 0) return undefined
    return sorting.map((s) => `${s.desc ? '-' : ''}${s.id}`).join(',')
  }, [sorting, sortItems])

  // When column header sort changes, clear sort panel.
  const handleHeaderSortChange = useCallback((next: SortingState) => {
    setSorting(next)
    if (next.length > 0) setSortItems([])
  }, [])

  // When sort panel changes, clear column header sort.
  const handleSortPanelChange = useCallback((items: SortItem[]) => {
    setSortItems(items)
    if (items.length > 0) setSorting([])
    setPage(1)
  }, [])

  // Build filters from conditions + search text.
  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    for (const cond of filterConditions) {
      if (cond.operator === 'is_null') {
        f[cond.field] = 'is_null:'
      } else if (cond.value) {
        f[cond.field] = `${cond.operator}:${cond.value}`
      }
    }
    // Full-text search across all text/textarea fields via backend ?q= param.
    if (searchText) {
      f.q = searchText
    }
    return Object.keys(f).length > 0 ? f : undefined
  }, [filterConditions, searchText, collection])

  const {
    data: list,
    isLoading: entriesLoading,
    isError: entriesError,
    error: entriesErr,
    refetch,
  } = useEntries(collection?.slug, {
    page,
    limit,
    sort: sortParam,
    expand,
    filters,
  })

  const createEntry = useCreateEntry(collection?.slug ?? '')
  const updateEntry = useUpdateEntry(collection?.slug ?? '')
  const batchUpdateEntry = useBatchUpdateEntry(collection?.slug ?? '')
  const deleteEntry = useDeleteEntry(collection?.slug ?? '')
  const bulkDelete = useBulkDeleteEntries(collection?.slug ?? '')

  // Multi-select state for bulk operations.
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Detect views.
  const selectField = useMemo(
    () => collection?.fields?.find((f) => f.field_type === 'select'),
    [collection],
  )
  const dateField = useMemo(
    () => collection?.fields?.find((f) => f.field_type === 'date' || f.field_type === 'datetime'),
    [collection],
  )
  const fileField = useMemo(
    () => collection?.fields?.find((f) => f.field_type === 'file'),
    [collection],
  )

  // Formula fields are read-only in the grid.
  const formulaReadonlyCols = useMemo(
    () => collection?.fields?.filter((f) => f.field_type === 'formula').map((f) => f.slug) ?? [],
    [collection],
  )

  // Numeric fields for summary row.
  const numericFields = useMemo(
    () =>
      collection?.fields?.filter(
        (f) => f.field_type === 'number' || f.field_type === 'integer',
      ) ?? [],
    [collection],
  )

  // Compute summary row from current page data.
  const summaryRow = useMemo(() => {
    if (numericFields.length === 0 || !list?.data?.length) return undefined
    const summary: Record<string, { label: string; value: string | number }> = {}
    for (const f of numericFields) {
      const values = list.data
        .map((e) => Number(e[f.slug]))
        .filter((n) => !isNaN(n))
      if (values.length === 0) continue
      const sum = values.reduce((a, b) => a + b, 0)
      const avg = sum / values.length
      const isAllOnePage = list?.total != null && list.data.length >= list.total
      const scopeLabel = isAllOnePage ? '' : ' (현재 페이지)'
      summary[f.slug] = {
        label: `합계 ${sum.toLocaleString('ko')} / 평균 ${avg.toLocaleString('ko', { maximumFractionDigits: 1 })}${scopeLabel}`,
        value: sum,
      }
    }
    return Object.keys(summary).length > 0 ? summary : undefined
  }, [numericFields, list])

  // Build columns from collection.fields.
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!collection?.fields) return []
    const cols: ColumnDef<Record<string, unknown>>[] = []

    // Process status column (first if enabled and visible).
    if (processVisible && process?.is_enabled && process.statuses?.length) {
      cols.push({
        id: '_status',
        header: '상태',
        enableSorting: true,
        cell: ({ row }) => {
          const statusName = row.original._status as string
          if (!statusName) return <span className="text-muted-foreground">미설정</span>
          const statusDef = process.statuses.find((s) => s.name === statusName)
          return (
            <Badge
              style={{
                backgroundColor: statusDef?.color ?? '#6b7280',
                color: '#fff',
              }}
            >
              {statusName}
            </Badge>
          )
        },
      })
    }

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
            const dt = f.options?.display_type as string | undefined

            // Render text display subtypes as clickable links
            if (f.field_type === 'text' && dt && v) {
              const s = String(v)
              if (dt === 'url') return <a href={s.startsWith('http') ? s : `https://${s}`} target="_blank" rel="noopener noreferrer" className="text-primary underline" onClick={(e) => e.stopPropagation()}>{s}</a>
              if (dt === 'email') return <a href={`mailto:${s}`} className="text-primary underline" onClick={(e) => e.stopPropagation()}>{s}</a>
              if (dt === 'phone') return <a href={`tel:${s}`} className="text-primary underline" onClick={(e) => e.stopPropagation()}>{s}</a>
            }

            // Render progress bar inline
            if ((f.field_type === 'number' || f.field_type === 'integer') && dt === 'progress' && v != null) {
              const num = Number(v)
              return (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, num))}%` }} />
                  </div>
                  <span className="text-xs">{num}%</span>
                </div>
              )
            }

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
    cols.push({
      id: '_actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      size: 60,
      cell: ({ row }) => (
        <RoleGate roles={['director', 'pm']}>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setDeleteId(String(row.original.id))
            }}
          >
            삭제
          </Button>
        </RoleGate>
      ),
    })
    return cols
  }, [collection, process, processVisible])

  // Inline edit handler.
  const handleCellEdit = useCallback(
    (event: CellEditEvent) => {
      updateEntry.mutate(
        { id: event.rowId, body: { [event.columnId]: event.value } },
        {
          onSuccess: () => toast.success('수정되었습니다'),
          onError: (err) => toast.error(formatError(err)),
        },
      )
    },
    [updateEntry],
  )

  // Batch edit handler (for paste operations).
  const handleBatchCellEdit = useCallback(
    (event: BatchCellEditEvent) => {
      // Group updates by rowId.
      const byRow = new Map<string, Record<string, unknown>>()
      for (const u of event.updates) {
        const existing = byRow.get(u.rowId) ?? {}
        existing[u.columnId] = u.value
        byRow.set(u.rowId, existing)
      }
      const updates = Array.from(byRow.entries()).map(([id, fields]) => ({ id, fields }))
      batchUpdateEntry.mutate(updates, {
        onSuccess: () => toast.success(`${updates.length}건 수정되었습니다`),
        onError: (err) => toast.error(formatError(err)),
      })
    },
    [batchUpdateEntry],
  )

  // Search with debounce.
  function handleSearchInput(value: string) {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setSearchText(value)
      setPage(1)
    }, 300)
  }

  // CSV export.
  function handleCsvExport() {
    if (!collection) return
    const params = new URLSearchParams()
    if (searchText) params.set('q', searchText)
    if (sortParam) params.set('sort', sortParam)
    for (const cond of filterConditions) {
      if (cond.operator === 'is_null') {
        params.set(cond.field, 'is_null:')
      } else if (cond.value) {
        params.set(cond.field, `${cond.operator}:${cond.value}`)
      }
    }
    const qs = params.toString()
    window.open(`/api/data/${collection.slug}/export.csv${qs ? `?${qs}` : ''}`, '_blank')
  }

  if (colLoading) return <LoadingState />
  if (colError) return <ErrorState error={colErr} />
  if (!collection) return null

  function handleEntryClick(entry: Record<string, unknown>) {
    setEditEntry(entry)
    setSheetOpen(true)
  }

  function handleGanttUpdate(entryId: string, updates: Record<string, unknown>) {
    updateEntry.mutate(
      { id: entryId, body: updates },
      {
        onSuccess: () => toast.success('일정이 변경되었습니다'),
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  function handleCardMove(entryId: string, newValue: string) {
    if (!selectField) return
    updateEntry.mutate(
      { id: entryId, body: { [selectField.slug]: newValue } },
      {
        onSuccess: () => toast.success('이동되었습니다'),
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  function handleSubmit(data: Record<string, unknown>) {
    if (editEntry?.id) {
      updateEntry.mutate(
        { id: String(editEntry.id), body: data },
        {
          onSuccess: () => toast.success('수정되었습니다'),
          onError: (err) => toast.error(formatError(err)),
        },
      )
    } else {
      createEntry.mutate(data, {
        onSuccess: () => toast.success('생성되었습니다'),
        onError: (err) => toast.error(formatError(err)),
      })
    }
  }

  function handleDelete() {
    if (!deleteId) return
    deleteEntry.mutate(deleteId, {
      onSuccess: () => {
        toast.success('삭제되었습니다')
        setDeleteId(null)
      },
      onError: (err) => toast.error(formatError(err)),
    })
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedRowIds)
    if (ids.length === 0) return
    bulkDelete.mutate(ids, {
      onSuccess: () => {
        toast.success(`${ids.length}건 삭제되었습니다`)
        setSelectedRowIds(new Set())
        setBulkDeleteOpen(false)
      },
      onError: (err) => toast.error(formatError(err)),
    })
  }

  const handleImportCSV = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !collection) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`/api/data/${collection.slug}/import`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || body.message || res.statusText)
      }
      const result = await res.json()
      const count = result.data?.imported ?? 0
      toast.success(`${count}건 가져왔습니다`)
      setImportedCount(count)
      await refetch()
      // Clear highlight after animation
      setTimeout(() => setImportedCount(0), 2000)
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      e.target.value = ''
    }
  }, [collection, refetch])

  const dateFields = useMemo(
    () => collection.fields?.filter((f) => f.field_type === 'date' || f.field_type === 'datetime') ?? [],
    [collection],
  )
  const hasKanban = !!selectField
  const hasCalendar = !!dateField
  const hasGallery = !!fileField
  const hasGantt = dateFields.length >= 1

  function applyView(view: SavedView) {
    setActiveView(view)
    if (view.filter_config && Object.keys(view.filter_config).length > 0) {
      const restored: FilterCondition[] = Object.entries(view.filter_config).map(
        ([key, value], i) => {
          const parts = key.split(':')
          const field = parts[0]
          const operator = parts.slice(1).join(':') || 'eq'
          return { id: `sv-${i}`, field, operator, value }
        },
      )
      setFilterConditions(restored)
    } else {
      setFilterConditions([])
    }
    if (view.sort_config) {
      const items: SortItem[] = view.sort_config.split(',').filter(Boolean).map((s) => ({
        field: s.startsWith('-') ? s.slice(1) : s,
        desc: s.startsWith('-'),
      }))
      setSortItems(items)
    } else {
      setSortItems([])
    }
    setPage(1)
  }

  function clearView() {
    setActiveView(null)
    setFilterConditions([])
    setSortItems([])
    setPage(1)
  }

  function handleSaveView() {
    if (!newViewName.trim()) return
    const filterConfig: Record<string, string> = {}
    for (const c of filterConditions) {
      if (c.field && c.operator) {
        filterConfig[`${c.field}:${c.operator}`] = c.value
      }
    }
    const sortConfig = sortItems.length > 0
      ? sortItems.map((s) => `${s.desc ? '-' : ''}${s.field}`).join(',')
      : ''

    createSavedView.mutate(
      {
        name: newViewName.trim(),
        filter_config: filterConfig,
        sort_config: sortConfig,
        is_public: true,
      },
      {
        onSuccess: () => {
          toast.success('뷰가 저장되었습니다')
          setNewViewName('')
          setSavingView(false)
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  // Toolbar rendered inside DataTable.
  const tableToolbar = (
    <div className="flex items-center gap-2 flex-wrap">
      {/* ── Group 1: 데이터 조회 (검색·필터·정렬) ── */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-8 w-[200px] pl-8 text-sm"
          placeholder="검색..."
          defaultValue=""
          onChange={(e) => handleSearchInput(e.target.value)}
        />
        {searchText && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => {
              setSearchText('')
              setPage(1)
            }}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <Popover>
        <PopoverTrigger
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent h-8"
        >
            <Filter className="h-3.5 w-3.5" />
            필터
            {filterConditions.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {filterConditions.length}
              </Badge>
            )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto min-w-[420px] p-3">
          <div className="mb-2 text-sm font-medium">필터 조건</div>
          <FilterBuilder
            fields={collection.fields ?? []}
            conditions={filterConditions}
            onChange={(conds) => {
              setFilterConditions(conds)
              setPage(1)
            }}
          />
          {filterConditions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-destructive"
              onClick={() => {
                setFilterConditions([])
                setPage(1)
              }}
            >
              전체 해제
            </Button>
          )}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent h-8"
        >
            <ArrowDownUp className="h-3.5 w-3.5" />
            정렬
            {sortItems.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {sortItems.length}
              </Badge>
            )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto min-w-[360px] p-3">
          <div className="mb-2 text-sm font-medium">정렬 설정</div>
          <SortPanel
            fields={collection.fields ?? []}
            sorts={sortItems}
            onChange={handleSortPanelChange}
          />
          {sortItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-destructive"
              onClick={() => setSortItems([])}
            >
              전체 해제
            </Button>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Group 2: 데이터 입출력 + 프로세스 ── */}
      <div className="flex items-center gap-2 border-l pl-3 ml-1">
        {process?.is_enabled && (
          <Button
            variant={processVisible ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1"
            onClick={() => setProcessVisible(!processVisible)}
          >
            {processVisible ? (
              <Power className="h-3.5 w-3.5" />
            ) : (
              <PowerOff className="h-3.5 w-3.5" />
            )}
            프로세스
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent h-8"
          >
            <Ellipsis className="h-3.5 w-3.5" />
            더보기
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleCsvExport}>
              <Download className="h-3.5 w-3.5 mr-2" />
              내보내기
            </DropdownMenuItem>
            <RoleGate roles={['director', 'pm', 'engineer']}>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-2" />
                가져오기
              </DropdownMenuItem>
            </RoleGate>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleImportCSV}
        />
      </div>

      {/* ── Group 3: 뷰 관리 ── */}
      {((savedViews && savedViews.length > 0) || filterConditions.length > 0 || sortItems.length > 0) && (
        <div className="flex items-center gap-1.5 border-l pl-3 ml-1">
          {savedViews && savedViews.length > 0 && (
            <>
              <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
              {savedViews.map((v) => (
                <Badge
                  key={v.id}
                  variant={activeView?.id === v.id ? 'default' : 'outline'}
                  className="cursor-pointer gap-1 text-xs"
                  onClick={() => {
                    if (activeView?.id === v.id) {
                      clearView()
                    } else {
                      applyView(v)
                    }
                  }}
                >
                  {v.name}
                  {activeView?.id === v.id && (
                    <button
                      type="button"
                      className="ml-0.5 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSavedView.mutate(v.id, {
                          onSuccess: () => {
                            toast.success('뷰가 삭제되었습니다')
                            clearView()
                          },
                          onError: (err) => toast.error(formatError(err)),
                        })
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </>
          )}

          {/* Active filter/sort indicator */}
          {(filterConditions.length > 0 || sortItems.length > 0) && (
            <div className="flex items-center gap-2 border-l pl-2 ml-1 text-xs text-muted-foreground">
              {filterConditions.length > 0 && (
                <span>{filterConditions.length}개 조건 적용됨</span>
              )}
              {sortItems.length > 0 && (
                <span>{sortItems.length}개 정렬 적용됨</span>
              )}
            </div>
          )}

          {(filterConditions.length > 0 || sortItems.length > 0) && !savingView && (
            <Popover>
              <PopoverTrigger
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent h-8"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                뷰 저장
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">현재 필터/정렬을 뷰로 저장</div>
                  <Input
                    className="h-8"
                    placeholder="뷰 이름"
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveView()}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!newViewName.trim() || createSavedView.isPending}
                    onClick={handleSaveView}
                  >
                    {createSavedView.isPending ? '저장 중...' : '저장'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader
        title={collection.label}
        description={collection.description}
        actions={
          <>
            <Link to={`/apps/${collection.id}/dashboard`}>
              <Button variant="outline" className="gap-1">
                <BarChart3 className="h-4 w-4" />
                대시보드
              </Button>
            </Link>
            <RoleGate roles={['director', 'pm']}>
              <Link to={`/apps/${collection.id}/settings`}>
                <Button variant="outline">설정</Button>
              </Link>
            </RoleGate>
            <Button
              onClick={() => {
                setEditEntry(undefined)
                setSheetOpen(true)
              }}
            >
              {TERM.newRecord}
            </Button>
          </>
        }
      />

      <ChartPanel
        slug={collection.slug}
        fields={collection.fields ?? []}
        totalRecords={list?.total ?? 0}
      />

      {entriesLoading && !list && <LoadingState />}
      {entriesError && <ErrorState error={entriesErr} onRetry={() => refetch()} />}

      {list && (
        <Tabs defaultValue="list">
          {(hasKanban || hasCalendar || hasGallery || hasGantt) && (
            <TabsList className="mb-4">
              <TabsTrigger value="list">목록</TabsTrigger>
              {hasKanban && <TabsTrigger value="kanban">칸반</TabsTrigger>}
              {hasCalendar && (
                <TabsTrigger value="calendar" className="gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  캘린더
                </TabsTrigger>
              )}
              {hasGallery && (
                <TabsTrigger value="gallery" className="gap-1">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  갤러리
                </TabsTrigger>
              )}
              {hasGantt && (
                <TabsTrigger value="gantt" className="gap-1">
                  <GanttChart className="h-3.5 w-3.5" />
                  간트
                </TabsTrigger>
              )}
            </TabsList>
          )}

          <TabsContent value="list" className="mt-0">
            {selectedRowIds.size > 0 && (
              <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{selectedRowIds.size}건 선택</span>
                <RoleGate roles={['director', 'pm']}>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    일괄 삭제
                  </Button>
                </RoleGate>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setSelectedRowIds(new Set())}
                >
                  선택 해제
                </Button>
              </div>
            )}
            <DataTable
              columns={columns}
              data={list.data}
              total={list.total}
              page={page}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
              onSortChange={handleHeaderSortChange}
              onRowClick={handleEntryClick}
              onCellEdit={handleCellEdit}
              onBatchCellEdit={handleBatchCellEdit}
              readonlyColumns={formulaReadonlyCols}
              emptyTitle={TERM.noRecords}
              emptyDescription={TERM.noRecordsDesc}
              summaryRow={summaryRow}
              toolbar={tableToolbar}
              highlightRows={importedCount}
              selectable
              selectedRowIds={selectedRowIds}
              onSelectionChange={setSelectedRowIds}
            />
          </TabsContent>

          {hasKanban && selectField && (
            <TabsContent value="kanban" className="mt-0">
              <KanbanView
                groupField={selectField}
                fields={collection.fields ?? []}
                entries={list.data}
                onCardClick={handleEntryClick}
                onCardMove={handleCardMove}
              />
            </TabsContent>
          )}

          {hasCalendar && dateField && (
            <TabsContent value="calendar" className="mt-0">
              <CalendarView
                dateField={dateField}
                fields={collection.fields ?? []}
                entries={list.data}
                onEntryClick={handleEntryClick}
              />
            </TabsContent>
          )}

          {hasGallery && fileField && (
            <TabsContent value="gallery" className="mt-0">
              <GalleryView
                imageField={fileField}
                fields={collection.fields ?? []}
                entries={list.data}
                onEntryClick={handleEntryClick}
              />
            </TabsContent>
          )}

          {hasGantt && (
            <TabsContent value="gantt" className="mt-0">
              <GanttView
                fields={collection.fields ?? []}
                entries={list.data}
                onEntryClick={handleEntryClick}
                onEntryUpdate={handleGanttUpdate}
              />
            </TabsContent>
          )}
        </Tabs>
      )}

      <EntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        fields={collection.fields ?? []}
        slug={collection.slug}
        initialData={editEntry}
        onSubmit={handleSubmit}
        submitting={createEntry.isPending || updateEntry.isPending}
        title={editEntry ? `${TERM.record} 편집` : TERM.newRecord}
        process={process}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={`${TERM.record}를 삭제하시겠습니까?`}
        description="삭제된 데이터는 휴지통에서 복구할 수 있습니다."
        variant="destructive"
        confirmLabel="삭제"
        onConfirm={handleDelete}
        loading={deleteEntry.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
        title={`${selectedRowIds.size}건의 ${TERM.record}를 삭제하시겠습니까?`}
        description="삭제된 데이터는 휴지통에서 복구할 수 있습니다."
        variant="destructive"
        confirmLabel={`${selectedRowIds.size}건 삭제`}
        onConfirm={handleBulkDelete}
        loading={bulkDelete.isPending}
      />
    </div>
  )
}
