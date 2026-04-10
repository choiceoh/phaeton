import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  ArrowDownUp,
  Bookmark,
  BookmarkPlus,
  BarChart3,
  Calendar,
  Download,
  FileText,
  Filter,
  Mail,
  GanttChart,
  LayoutGrid,
  Loader2,
  Pencil,
  Power,
  PowerOff,
  Search,
  Trash2,
  Upload,
  X,
  Ellipsis,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import HotkeyHelpDialog from '@/components/common/HotkeyHelpDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type BatchCellEditEvent, type CellEditEvent, type FieldMeta, DataTable } from '@/components/common/DataTable'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import RoleGate from '@/components/common/RoleGate'
import BulkEditPanel from '@/components/works/BulkEditPanel'
import CSVImportPreview from '@/components/works/CSVImportPreview'
import EntrySheet from '@/components/works/EntrySheet'
import FilterBuilder from '@/components/works/FilterBuilder'
import FilterChips from '@/components/works/FilterChips'
import SortPanel, { type SortItem } from '@/components/works/SortPanel'
import CalendarView from '@/components/works/views/CalendarView'
import ChartPanel from '@/components/works/views/ChartPanel'
import GalleryView from '@/components/works/views/GalleryView'
import FormView from '@/components/works/views/FormView'
import GanttView from '@/components/works/views/GanttView'
import KanbanView from '@/components/works/views/KanbanView'
import SetupChecklist from '@/components/works/SetupChecklist'
import ViewGuide from '@/components/works/views/ViewGuide'
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
import { useHotkeys } from '@/hooks/useHotkeys'
import { useCollection } from '@/hooks/useCollections'
import {
  useBatchUpdateEntry,
  useBulkDeleteEntries,
  useCreateEntry,
  useDeleteEntry,
  useEntries,
  useTotals,
  useEntryDefaults,
  useUpdateEntry,
} from '@/hooks/useEntries'
import { useProcess } from '@/hooks/useProcess'
import { useSavedViews, useCreateSavedView, useDeleteSavedView } from '@/hooks/useSavedViews'
import { canManageCollection, useCurrentUser } from '@/hooks/useAuth'
import { useAutomationRunToasts } from '@/hooks/useAutomationRunToasts'
import { useRetryToast } from '@/hooks/useRetryToast'
import { useUndoToast } from '@/hooks/useUndoToast'
import { api, ApiError, formatError } from '@/lib/api'
import { isLayoutType, TERM } from '@/lib/constants'
import { formatCell } from '@/lib/formatCell'
import type { FilterCondition, SavedView } from '@/lib/types'

const DEFAULT_LIMIT = 20

export default function AppViewPage() {
  const { appId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'list'
  const setActiveTab = useCallback((tab: string | number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (String(tab) === 'list') next.delete('tab')
      else next.set('tab', String(tab))
      return next
    }, { replace: true })
  }, [setSearchParams])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [sorting, setSorting] = useState<SortingState>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<Record<string, unknown> | undefined>()
  const [duplicateData, setDuplicateData] = useState<Record<string, unknown> | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [newEntryId, setNewEntryId] = useState<string | null>(null)
  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false)

  // Filter state
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([])

  // Sort panel state (separate from column header sorting)
  const [sortItems, setSortItems] = useState<SortItem[]>([])

  // Search state
  const [searchText, setSearchText] = useState('')
  const [searchInputValue, setSearchInputValue] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  // Process toggle (frontend-only)
  const [processVisible, setProcessVisible] = useState(true)

  // Cell save state for visual feedback (key = "rowId:columnId")
  const [cellSaveState, setCellSaveState] = useState<Map<string, 'saving' | 'saved'>>(new Map())

  // Saved views state
  const [activeView, setActiveView] = useState<SavedView | null>(null)
  const [savingView, setSavingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  const { data: collection, isLoading: colLoading, isError: colError, error: colErr } =
    useCollection(appId)
  const { data: process } = useProcess(appId)
  const { data: currentUser } = useCurrentUser()
  const canManage = canManageCollection(currentUser, collection?.created_by)

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
  const { data: entryDefaults } = useEntryDefaults(collection?.slug)
  const batchUpdateEntry = useBatchUpdateEntry(collection?.slug ?? '')
  const deleteEntry = useDeleteEntry(collection?.slug ?? '')
  const bulkDelete = useBulkDeleteEntries(collection?.slug ?? '')
  const undoToast = useUndoToast()
  const retryToast = useRetryToast()

  // Multi-select state for bulk operations.
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

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

  // Keyboard shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: '?', handler: () => setHotkeyHelpOpen(true) },
    { key: 'mod+n', handler: () => { setEditEntry(undefined); setSheetOpen(true) } },
    { key: 'mod+f', handler: () => searchInputRef.current?.focus() },
  ])

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

  // Per-column aggregate function state (default: sum).
  const aggFnStorageKey = appId ? `phaeton:aggfn:${appId}` : null
  const [columnAggFn, setColumnAggFn] = useState<Record<string, string>>(() => {
    if (aggFnStorageKey) {
      try {
        const saved = localStorage.getItem(aggFnStorageKey)
        if (saved) return JSON.parse(saved)
      } catch { /* ignore */ }
    }
    return {}
  })

  const handleAggFnChange = useCallback(
    (slug: string, fn: string) => {
      setColumnAggFn((prev) => {
        const next = { ...prev, [slug]: fn }
        if (aggFnStorageKey) {
          try { localStorage.setItem(aggFnStorageKey, JSON.stringify(next)) } catch { /* ignore */ }
        }
        return next
      })
    },
    [aggFnStorageKey],
  )

  // Fetch server-side totals for all numeric fields (single query).
  const totalsSlug = numericFields.length > 0 ? collection?.slug : undefined
  const { data: totals } = useTotals(totalsSlug, filters)

  // Build summary row from server-side totals with page-level fallback.
  const summaryRow = useMemo(() => {
    if (numericFields.length === 0 || !list?.data?.length) return undefined
    const summary: Record<string, { label: string; value: string | number }> = {}
    const fnLabels: Record<string, string> = { sum: '합계', avg: '평균', count: '개수', min: '최소', max: '최대' }

    for (const f of numericFields) {
      const fn = columnAggFn[f.slug] || 'sum'
      const fnLabel = fnLabels[fn] || fn

      // Server-side totals (preferred).
      const serverField = totals?.[f.slug]
      const serverAgg = typeof serverField === 'object' && serverField !== null
        ? serverField as { sum: number; avg: number; min: number; max: number }
        : null
      const serverCount = totals?._count as number | undefined

      // Page-level fallback.
      const pageValues = list.data
        .map((e) => Number(e[f.slug]))
        .filter((n) => !isNaN(n))
      if (pageValues.length === 0 && !serverAgg) continue
      const pageSum = pageValues.reduce((a, b) => a + b, 0)
      const pageAvg = pageValues.length > 0 ? pageSum / pageValues.length : 0

      let displayValue: number
      let label: string

      switch (fn) {
        case 'sum':
          displayValue = serverAgg?.sum ?? pageSum
          break
        case 'avg':
          displayValue = serverAgg?.avg ?? pageAvg
          break
        case 'count':
          displayValue = serverCount ?? list.total ?? pageValues.length
          break
        case 'min':
          displayValue = serverAgg?.min ?? Math.min(...pageValues)
          break
        case 'max':
          displayValue = serverAgg?.max ?? Math.max(...pageValues)
          break
        default:
          displayValue = serverAgg?.sum ?? pageSum
      }

      label = `${fnLabel} ${displayValue.toLocaleString('ko', { maximumFractionDigits: fn === 'count' ? 0 : 1 })}`
      if (serverAgg && list.total != null && list.data.length < list.total) {
        label += ' (전체)'
      }
      summary[f.slug] = { label, value: displayValue }
    }
    return Object.keys(summary).length > 0 ? summary : undefined
  }, [numericFields, list, columnAggFn, totals])

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
      cell: ({ row }) => canManage ? (
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
      ) : null,
    })
    return cols
  }, [collection, process, processVisible])

  // Build fieldMeta map for type-specific inline editors.
  const fieldMeta = useMemo<Record<string, FieldMeta>>(() => {
    if (!collection?.fields) return {}
    const meta: Record<string, FieldMeta> = {}
    for (const f of collection.fields) {
      meta[f.slug] = { fieldType: f.field_type, options: f.options }
    }
    return meta
  }, [collection?.fields])

  // Default: hide columns beyond the first 8 data fields, restored from localStorage if available.
  const colVisStorageKey = appId ? `phaeton:colvis:${appId}` : null
  const initialColumnVisibility = useMemo<Record<string, boolean>>(() => {
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
  }, [collection, colVisStorageKey])

  const handleColumnVisibilityChange = useCallback(
    (visibility: Record<string, boolean>) => {
      if (colVisStorageKey) {
        try { localStorage.setItem(colVisStorageKey, JSON.stringify(visibility)) } catch { /* ignore */ }
      }
    },
    [colVisStorageKey],
  )

  // Helper: find _version for a row from the current list data.
  const getRowVersion = useCallback(
    (rowId: string): number | undefined => {
      const row = list?.data?.find((r) => r.id === rowId)
      return row?._version as number | undefined
    },
    [list],
  )

  // Inline edit handler with cell-level visual feedback + undo.
  const handleCellEdit = useCallback(
    (event: CellEditEvent) => {
      const cellKey = `${event.rowId}:${event.columnId}`
      const body: Record<string, unknown> = { [event.columnId]: event.value }
      const version = getRowVersion(event.rowId)
      if (version != null) body._version = version

      // Capture old value for undo.
      const oldValue = list?.data?.find((r) => String(r.id) === event.rowId)?.[event.columnId]

      setCellSaveState((prev) => new Map(prev).set(cellKey, 'saving'))
      updateEntry.mutate(
        { id: event.rowId, body },
        {
          onSuccess: () => {
            setCellSaveState((prev) => new Map(prev).set(cellKey, 'saved'))
            setTimeout(() => {
              setCellSaveState((prev) => {
                const next = new Map(prev)
                next.delete(cellKey)
                return next
              })
            }, 1500)
            // Offer undo only when old value differs.
            if (oldValue !== event.value) {
              undoToast.push(
                '수정되었습니다',
                () => {
                  const undoBody: Record<string, unknown> = { [event.columnId]: oldValue }
                  updateEntry.mutate({ id: event.rowId, body: undoBody })
                },
                () => {
                  const redoBody: Record<string, unknown> = { [event.columnId]: event.value }
                  updateEntry.mutate({ id: event.rowId, body: redoBody })
                },
              )
            }
          },
          onError: (err) => {
            setCellSaveState((prev) => {
              const next = new Map(prev)
              next.delete(cellKey)
              return next
            })
            if (err instanceof ApiError && err.isConflict()) {
              toast.error('다른 사용자가 이미 수정했습니다. 최신 데이터를 불러옵니다.')
              refetch()
            } else {
              toast.error(formatError(err))
            }
          },
        },
      )
    },
    [updateEntry, getRowVersion, refetch, list, undoToast],
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
      const updates = Array.from(byRow.entries()).map(([id, fields]) => {
        const version = getRowVersion(id)
        return { id, fields, _version: version }
      })
      const toastId = toast.loading(`${updates.length}건 저장 중...`)
      batchUpdateEntry.mutate(updates, {
        onSuccess: () => {
          toast.success(`${updates.length}건 수정되었습니다`, { id: toastId })
        },
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict()) {
            toast.error('다른 사용자가 이미 수정했습니다. 최신 데이터를 불러옵니다.', { id: toastId })
            refetch()
          } else {
            toast.error(formatError(err), { id: toastId })
          }
        },
      })
    },
    [batchUpdateEntry, getRowVersion, refetch],
  )

  // Search with debounce.
  function handleSearchInput(value: string) {
    setSearchInputValue(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setSearchText(value)
      setPage(1)
    }, 300)
  }

  // Export query string builder (shared by CSV/PDF).
  function buildExportQS() {
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
    return params.toString()
  }

  // CSV export.
  function handleCsvExport() {
    if (!collection) return
    const qs = buildExportQS()
    window.open(`/api/data/${collection.slug}/export.csv${qs ? `?${qs}` : ''}`, '_blank')
  }

  // PDF export.
  function handlePdfExport() {
    if (!collection) return
    const qs = buildExportQS()
    window.open(`/api/data/${collection.slug}/export.pdf${qs ? `?${qs}` : ''}`, '_blank')
  }

  // Email report.
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [emailSending, setEmailSending] = useState(false)

  async function handleEmailReport() {
    if (!collection || !emailTo) return
    setEmailSending(true)
    try {
      const qs = buildExportQS()
      await api.post(`/data/${collection.slug}/email-report${qs ? `?${qs}` : ''}`, {
        to: emailTo,
        subject: `[Topworks] ${collection.label} 리포트`,
        message: emailMessage || `${collection.label} 데이터 리포트입니다.`,
      })
      toast.success(`${emailTo}로 리포트가 전송되었습니다`)
      setEmailDialogOpen(false)
      setEmailTo('')
      setEmailMessage('')
    } catch (err) {
      retryToast(err, handleEmailReport)
    } finally {
      setEmailSending(false)
    }
  }

  const [importingCSV, setImportingCSV] = useState(false)
  const [csvPreviewFile, setCsvPreviewFile] = useState<File | null>(null)
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false)

  const handleImportCSV = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvPreviewFile(file)
    setCsvPreviewOpen(true)
    e.target.value = ''
  }, [])

  const handleCSVConfirm = useCallback(async (file: File, columnMap: Record<string, string>) => {
    if (!collection) return
    setCsvPreviewOpen(false)
    setImportingCSV(true)
    const toastId = toast.loading('CSV 가져오는 중...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (Object.keys(columnMap).length > 0) {
        formData.append('column_map', JSON.stringify(columnMap))
      }
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
      toast.success(`${count}건 가져왔습니다`, { id: toastId })
      setImportedCount(count)
      await refetch()
      setTimeout(() => setImportedCount(0), 2000)
    } catch (err) {
      toast.error(formatError(err), { id: toastId })
    } finally {
      setImportingCSV(false)
      setCsvPreviewFile(null)
    }
  }, [collection, refetch])

  const dateFields = useMemo(
    () => collection?.fields?.filter((f) => f.field_type === 'date' || f.field_type === 'datetime') ?? [],
    [collection],
  )

  // Build synthetic field for process status kanban
  const processGroupField = useMemo(() => {
    if (!process?.is_enabled || !process.statuses?.length) return undefined
    return {
      id: '_status',
      collection_id: '',
      slug: '_status',
      label: '상태',
      field_type: 'select' as const,
      is_required: false,
      is_unique: false,
      is_indexed: false,
      width: 6,
      height: 1,
      sort_order: 0,
      created_at: '',
      updated_at: '',
      options: {
        choices: process.statuses.map((s) => s.name),
      },
    }
  }, [process])

  // Build allowedMoves map for process kanban based on transitions + user role
  const processAllowedMoves = useMemo(() => {
    if (!process?.is_enabled || !process.transitions?.length || !process.statuses?.length) return undefined
    const userRole = currentUser?.role
    const statusById = new Map(process.statuses.map((s) => [s.id, s.name]))
    const moves = new Map<string, Set<string>>()
    // Initialize all statuses with empty sets
    for (const s of process.statuses) {
      moves.set(s.name, new Set())
    }
    for (const t of process.transitions) {
      // Check role permission
      if (t.allowed_roles.length > 0 && (!userRole || !t.allowed_roles.includes(userRole))) continue
      const fromName = statusById.get(t.from_status_id)
      const toName = statusById.get(t.to_status_id)
      if (fromName && toName) {
        moves.get(fromName)!.add(toName)
      }
    }
    return moves
  }, [process, currentUser])

  if (colLoading) return <LoadingState variant="table" />
  if (colError) return <ErrorState error={colErr} />
  if (!collection) return null

  const hasKanban = !!selectField
  const hasCalendar = !!dateField
  const hasGallery = !!fileField
  const hasGantt = dateFields.length >= 1
  const hasProcessKanban = process?.is_enabled && (process.statuses?.length ?? 0) > 0

  function handleEntryClick(entry: Record<string, unknown>) {
    setEditEntry(entry)
    setSheetOpen(true)
  }

  function handleGanttUpdate(entryId: string, updates: Record<string, unknown>) {
    const version = getRowVersion(entryId)
    if (version != null) updates._version = version
    updateEntry.mutate(
      { id: entryId, body: updates },
      {
        onSuccess: () => toast.success('일정이 변경되었습니다'),
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict()) {
            toast.error('다른 사용자가 이미 수정했습니다. 최신 데이터를 불러옵니다.')
            refetch()
          } else {
            toast.error(formatError(err))
          }
        },
      },
    )
  }

  function handleFormViewSubmit(data: Record<string, unknown>, entryId?: string) {
    if (entryId) {
      const entry = list?.data.find((e) => String(e.id) === entryId)
      const version = entry?._version as number | undefined
      if (version != null) data._version = version
      updateEntry.mutate(
        { id: entryId, body: data },
        {
          onSuccess: () => toast.success('수정되었습니다'),
          onError: (err) => {
            if (err instanceof ApiError && err.isConflict()) {
              toast.error('다른 사용자가 이미 수정했습니다. 최신 데이터를 불러옵니다.')
              refetch()
            } else {
              toast.error(formatError(err))
            }
          },
        },
      )
    } else {
      createEntry.mutate(data, {
        onSuccess: () => toast.success('생성되었습니다'),
        onError: (err) => retryToast(err, () => handleFormViewSubmit(data)),
      })
    }
  }

  function handleCardMove(entryId: string, newValue: string) {
    if (!selectField) return
    const body: Record<string, unknown> = { [selectField.slug]: newValue }
    const version = getRowVersion(entryId)
    if (version != null) body._version = version
    updateEntry.mutate(
      { id: entryId, body },
      {
        onSuccess: () => toast.success('이동되었습니다'),
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict()) {
            toast.error('다른 사용자가 이미 수정했습니다. 최신 데이터를 불러옵니다.')
            refetch()
          } else {
            retryToast(err, () => handleCardMove(entryId, newValue))
          }
        },
      },
    )
  }

  function handleProcessCardMove(entryId: string, newValue: string) {
    const body: Record<string, unknown> = { _status: newValue }
    const version = getRowVersion(entryId)
    if (version != null) body._version = version
    updateEntry.mutate(
      { id: entryId, body },
      {
        onSuccess: () => toast.success('상태가 변경되었습니다'),
        onError: (err) => {
          if (err instanceof ApiError && err.isConflict()) {
            toast.error('다른 사용자가 이미 수정했습니다. 최신 데이터를 불러옵니다.')
            refetch()
          } else {
            toast.error(formatError(err))
          }
        },
      },
    )
  }

  function handleSubmit(data: Record<string, unknown>) {
    if (editEntry?.id) {
      const version = editEntry._version as number | undefined
      if (version != null) data._version = version
      updateEntry.mutate(
        { id: String(editEntry.id), body: data },
        {
          onSuccess: () => toast.success('수정되었습니다'),
          onError: (err) => {
            if (err instanceof ApiError && err.isConflict()) {
              toast.error('다른 사용자가 이미 수정했습니다. 최신 데이터를 불러옵니다.')
              refetch()
              setSheetOpen(false)
            } else {
              retryToast(err, () => handleSubmit(data))
            }
          },
        },
      )
    } else {
      createEntry.mutate(data, {
        onSuccess: (result) => {
          toast.success('생성되었습니다')
          const id = (result as Record<string, unknown>)?.id
          if (id) {
            setNewEntryId(String(id))
            setTimeout(() => setNewEntryId(null), 500)
          }
        },
        onError: (err) => retryToast(err, () => handleSubmit(data)),
      })
    }
  }

  function handleDuplicate(data: Record<string, unknown>) {
    setSheetOpen(false)
    setTimeout(() => {
      setDuplicateData(data)
      setEditEntry(undefined)
      setSheetOpen(true)
    }, 200)
  }

  function handleDelete() {
    if (!deleteId) return
    const capturedDeleteId = deleteId
    // Capture entry data for undo (recreate).
    const deletedRow = list?.data?.find((r) => String(r.id) === capturedDeleteId)
    deleteEntry.mutate(capturedDeleteId, {
      onSuccess: () => {
        setDeleteId(null)
        if (deletedRow) {
          const { id: _id, _version: _v, created_at: _ca, updated_at: _ua, _optimistic: _o, ...rest } = deletedRow as Record<string, unknown>
          undoToast.push(
            '삭제되었습니다',
            () => { createEntry.mutate(rest) },
            () => { deleteEntry.mutate(String(deletedRow.id)) },
          )
        } else {
          toast.success('삭제되었습니다')
        }
      },
      onError: (err) => retryToast(err, () => {
        setDeleteId(capturedDeleteId)
      }),
    })
  }

  function handleBulkStatusChange(status: string) {
    const ids = Array.from(selectedRowIds)
    if (ids.length === 0) return
    const updates = ids.map((id) => {
      const version = getRowVersion(id)
      return { id, fields: { _status: status }, _version: version }
    })
    const toastId = toast.loading(`${ids.length}건 상태 변경 중...`)
    batchUpdateEntry.mutate(updates, {
      onSuccess: () => {
        toast.success(`${ids.length}건의 상태가 "${status}"(으)로 변경되었습니다`, { id: toastId })
        setSelectedRowIds(new Set())
      },
      onError: (err) => {
        if (err instanceof ApiError && err.isConflict()) {
          toast.error('일부 항목이 이미 수정되었습니다. 새로고침합니다.', { id: toastId })
          refetch()
        } else {
          toast.error(formatError(err), { id: toastId })
        }
      },
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
      onError: (err) => retryToast(err, () => handleBulkDelete()),
    })
  }

  function handleBulkEdit(fieldSlug: string, value: unknown) {
    const ids = Array.from(selectedRowIds)
    if (ids.length === 0) return
    const updates = ids.map((id) => {
      const version = getRowVersion(id)
      return { id, fields: { [fieldSlug]: value }, _version: version }
    })
    batchUpdateEntry.mutate(updates, {
      onSuccess: () => {
        toast.success(`${ids.length}건 수정되었습니다`)
        setSelectedRowIds(new Set())
        setBulkEditOpen(false)
      },
      onError: (err) => {
        if (err instanceof ApiError && err.isConflict()) {
          toast.error('다른 사용자가 이미 수정했습니다. 최신 데이터를 불러옵니다.')
          refetch()
        } else {
          toast.error(formatError(err))
        }
      },
    })
  }

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
          toast.success('보기가 저장되었습니다')
          setNewViewName('')
          setSavingView(false)
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  // Toolbar rendered inside DataTable.
  const tableToolbar = (
    <>
    <div className="flex items-center gap-2 flex-wrap w-full">
      {/* ── Group 1: 데이터 조회 (검색·필터·정렬) ── */}
      <div className="relative w-full sm:w-auto order-first">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          className="h-8 w-full sm:w-[200px] pl-8 text-sm"
          placeholder="검색..."
          value={searchInputValue}
          onChange={(e) => handleSearchInput(e.target.value)}
        />
        {searchInputValue && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => {
              setSearchInputValue('')
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
            slug={collection.slug}
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
      <div className="flex items-center gap-2 shrink-0 sm:border-l sm:pl-3 sm:ml-1">
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
            disabled={importingCSV}
          >
            {importingCSV
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Ellipsis className="h-3.5 w-3.5" />}
            더보기
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={handleCsvExport}>
              <Download className="h-3.5 w-3.5 mr-2" />
              CSV 내보내기
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handlePdfExport}>
              <FileText className="h-3.5 w-3.5 mr-2" />
              PDF 내보내기
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEmailDialogOpen(true)}>
              <Mail className="h-3.5 w-3.5 mr-2" />
              이메일 리포트
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
                            toast.success('보기가 삭제되었습니다')
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
                보기 저장
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">현재 필터/정렬을 보기로 저장</div>
                  <Input
                    className="h-8"
                    placeholder="보기 이름"
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
    <FilterChips
      conditions={filterConditions}
      sortItems={sortItems}
      fields={collection.fields ?? []}
      onRemoveFilter={(id) => {
        setFilterConditions((prev) => prev.filter((c) => c.id !== id))
        setPage(1)
      }}
      onRemoveSort={(index) => {
        setSortItems((prev) => prev.filter((_, i) => i !== index))
      }}
      onClearAll={() => {
        setFilterConditions([])
        setSortItems([])
        setPage(1)
      }}
    />
    </>
  )

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: '업무 목록', href: '/apps' },
          { label: collection.label },
        ]}
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
            <Link to={`/apps/${collection.id}/interface`}>
              <Button variant="outline" className="gap-1">
                <LayoutGrid className="h-4 w-4" />
                인터페이스
              </Button>
            </Link>
            {canManage && (
              <Link to={`/apps/${collection.id}/settings`}>
                <Button variant="outline">설정</Button>
              </Link>
            )}
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

      {list && (list.total ?? 0) < 5 && (
        <SetupChecklist
          collectionId={collection.id}
          items={[
            {
              label: '항목(필드) 추가하기',
              done: (collection.fields?.filter((f) => !isLayoutType(f.field_type)).length ?? 0) >= 2,
              href: `/apps/${collection.id}/settings`,
            },
            {
              label: '첫 데이터 입력하기',
              done: (list.total ?? 0) > 0,
            },
            {
              label: '보기(뷰) 저장하기',
              done: (savedViews?.length ?? 0) > 0,
            },
            {
              label: '프로세스 설정하기',
              done: !!process?.is_enabled,
              href: `/apps/${collection.id}/process`,
            },
          ]}
        />
      )}

      {entriesLoading && !list && <LoadingState variant="table" />}
      {entriesError && <ErrorState error={entriesErr} onRetry={() => refetch()} />}

      {list && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 max-w-full overflow-x-auto scrollbar-none">
            <TabsTrigger value="list">목록</TabsTrigger>
            {hasProcessKanban && <TabsTrigger value="status-kanban">상태별</TabsTrigger>}
            {hasKanban && <TabsTrigger value="kanban">보드</TabsTrigger>}
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
            <TabsTrigger value="form" className="gap-1">
              <FileText className="h-3.5 w-3.5" />
              폼
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-0">
            {selectedRowIds.size > 0 && (
              <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{selectedRowIds.size}건 선택</span>
                {process?.is_enabled && (process.statuses?.length ?? 0) > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent h-7"
                    >
                      상태 변경
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {process.statuses!.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          onClick={() => handleBulkStatusChange(s.name)}
                        >
                          <span
                            className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <RoleGate roles={['director', 'pm', 'engineer']}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={() => setBulkEditOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    일괄 편집
                  </Button>
                </RoleGate>
                {canManage && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    일괄 삭제
                  </Button>
                )}
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
              cellSaveState={cellSaveState}
              fieldMeta={fieldMeta}
              emptyTitle={searchText || filterConditions.length > 0 ? '검색 결과가 없습니다' : TERM.noRecords}
              emptyDescription={searchText || filterConditions.length > 0 ? '검색어 또는 필터 조건을 변경해 보세요.' : TERM.noRecordsDesc}
              emptyVariant={searchText || filterConditions.length > 0 ? 'no-results' : 'empty'}
              emptyAction={
                searchText || filterConditions.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSearchText('')
                      setSearchInputValue('')
                      setFilterConditions([])
                    }}
                  >
                    필터 초기화
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => { setEditEntry(undefined); setSheetOpen(true) }}>
                    {TERM.newRecord}
                  </Button>
                )
              }
              summaryRow={summaryRow}
              summaryFn={columnAggFn}
              onSummaryFnChange={handleAggFnChange}
              toolbar={tableToolbar}
              initialColumnVisibility={initialColumnVisibility}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              highlightRows={importedCount}
              newRowId={newEntryId}
              selectable
              selectedRowIds={selectedRowIds}
              onSelectionChange={setSelectedRowIds}
            />
            {list.data.length === 0 && (
              <ViewGuide fields={collection.fields ?? []} />
            )}
          </TabsContent>

          {hasProcessKanban && processGroupField && (
            <TabsContent value="status-kanban" className="mt-0">
              <KanbanView
                groupField={processGroupField}
                fields={collection.fields ?? []}
                entries={list.data}
                onCardClick={handleEntryClick}
                onCardMove={handleProcessCardMove}
                allowedMoves={processAllowedMoves}
                onAddEntry={() => { setEditEntry(undefined); setSheetOpen(true) }}
              />
            </TabsContent>
          )}

          {hasKanban && selectField && (
            <TabsContent value="kanban" className="mt-0">
              <KanbanView
                groupField={selectField}
                fields={collection.fields ?? []}
                entries={list.data}
                onCardClick={handleEntryClick}
                onCardMove={handleCardMove}
                onAddEntry={() => { setEditEntry(undefined); setSheetOpen(true) }}
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
                onEntryUpdate={handleGanttUpdate}
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

          <TabsContent value="form" className="mt-0">
            <FormView
              fields={collection.fields ?? []}
              entries={list.data}
              onEntryClick={handleEntryClick}
              onEntrySubmit={handleFormViewSubmit}
              onEntryDelete={(id) => setDeleteId(id)}
              submitting={createEntry.isPending || updateEntry.isPending}
              process={process}
              slug={collection.slug}
              total={list.total}
            />
          </TabsContent>
        </Tabs>
      )}

      <EntrySheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setDuplicateData(undefined) }}
        fields={collection.fields ?? []}
        slug={collection.slug}
        initialData={editEntry ?? duplicateData ?? (entryDefaults && Object.keys(entryDefaults).length > 0 ? entryDefaults : undefined)}
        onSubmit={handleSubmit}
        submitting={createEntry.isPending || updateEntry.isPending}
        title={editEntry ? `${TERM.record} 편집` : duplicateData ? '항목 복제' : TERM.newRecord}
        process={process}
        onDuplicate={handleDuplicate}
      />

      <CSVImportPreview
        open={csvPreviewOpen}
        onOpenChange={setCsvPreviewOpen}
        file={csvPreviewFile}
        fields={collection.fields ?? []}
        onConfirm={handleCSVConfirm}
      />

      <BulkEditPanel
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        fields={collection.fields ?? []}
        selectedCount={selectedRowIds.size}
        onApply={handleBulkEdit}
        loading={batchUpdateEntry.isPending}
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

      {/* Email report dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>이메일 리포트</DialogTitle>
            <DialogDescription>
              현재 필터가 적용된 데이터를 PDF로 생성하여 이메일로 전송합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="email-to">받는 사람</Label>
              <Input
                id="email-to"
                type="email"
                placeholder="user@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-msg">메시지 (선택)</Label>
              <Textarea
                id="email-msg"
                placeholder="리포트에 대한 설명을 입력하세요"
                rows={3}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleEmailReport} disabled={!emailTo || emailSending}>
              {emailSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              전송
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <HotkeyHelpDialog open={hotkeyHelpOpen} onOpenChange={setHotkeyHelpOpen} />
    </div>
  )
}
