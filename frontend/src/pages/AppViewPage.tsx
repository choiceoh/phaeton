/**
 * AppViewPage — Primary data viewer for a collection (app).
 *
 * Renders a single SpreadsheetView (Excel-like) with:
 * - Inline cell editing with optimistic updates
 * - Sheet tabs (SavedViews) for filter/sort presets
 * - Bulk operations (delete, edit selected)
 * - CSV import/export
 * - Process workflow transitions
 */
import type { SortingState } from '@tanstack/react-table'
import {
  ArrowDownUp,
  Download,
  Ellipsis,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutGrid,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Save,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
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
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
// PageHeader replaced by ExcelLayout TitleBar + Ribbon
import RoleGate from '@/components/common/RoleGate'
import BulkEditPanel from '@/components/works/BulkEditPanel'
import ImportPreview from '@/components/works/CSVImportPreview'
import FilterBuilder from '@/components/works/FilterBuilder'
import FilterChips from '@/components/works/FilterChips'
import AutomationsPanel from '@/components/works/AutomationsPanel'
import SettingsPanel from '@/components/works/SettingsPanel'
import SheetTabs from '@/components/works/SheetTabs'
import SortPanel, { type SortItem } from '@/components/works/SortPanel'
import { FormattingToolbar } from '@/components/excel/FormattingToolbar'
import SpreadsheetView from '@/components/works/views/SpreadsheetView'
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
import {
  Sheet as SheetPanel,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useExcelToolbar } from '@/contexts/ExcelToolbarContext'
import { useHotkeys } from '@/hooks/useHotkeys'
import { useAddField, useCollection, useDeleteField, useUpdateField, useWorkbooks } from '@/hooks/useCollections'
import {
  CLIENT_MODE_THRESHOLD,
  useBatchUpdateEntry,
  useBulkDeleteEntries,
  useCreateEntry,
  useEntries,
  useTotals,
  useUpdateEntry,
} from '@/hooks/useEntries'
import { useProcess } from '@/hooks/useProcess'
import { useSavedViews, useCreateSavedView, useDeleteSavedView } from '@/hooks/useSavedViews'
import { canManageCollection, useCurrentUser } from '@/hooks/useAuth'
import { useAutomationRunToasts } from '@/hooks/useAutomationRunToasts'
import { useCellFormatting } from '@/hooks/useCellFormatting'
import { useConflictAwareUpdate } from '@/hooks/useConflictAwareUpdate'
import { useGridBuffer } from '@/hooks/useGridBuffer'
import { useWorkbookLock } from '@/hooks/useLock'
import { useRetryToast } from '@/hooks/useRetryToast'
import { api, ApiError, formatError } from '@/lib/api'
import { TERM } from '@/lib/constants'
import type { CellPosition, SelectionRange } from '@/hooks/useGridNavigation'
import type { EntryRow, FieldType, FilterCondition, FilterGroup, SavedView } from '@/lib/types'
import { emptyFilterGroup, isFilterGroupEmpty, flattenFilterGroup, serializeFilterGroup } from '@/lib/types'

const DEFAULT_LIMIT = 20

// ---------------------------------------------------------------------------
// Client-side filter helpers (used when dataset ≤ CLIENT_MODE_THRESHOLD)
// ---------------------------------------------------------------------------

/** Test a single FilterCondition against a row value. */
function matchCondition(row: Record<string, unknown>, cond: FilterCondition): boolean {
  const raw = row[cond.field]
  const v = raw == null ? '' : String(raw)
  const cv = cond.value ?? ''
  switch (cond.operator) {
    case 'eq': return v === cv
    case 'neq': return v !== cv
    case 'gt': return Number(v) > Number(cv)
    case 'gte': return Number(v) >= Number(cv)
    case 'lt': return Number(v) < Number(cv)
    case 'lte': return Number(v) <= Number(cv)
    case 'like': return v.toLowerCase().includes(cv.toLowerCase())
    case 'contains': return v.toLowerCase().includes(cv.toLowerCase())
    case 'in': return cv.split(',').map((s) => s.trim()).includes(v)
    case 'not_in': return !cv.split(',').map((s) => s.trim()).includes(v)
    case 'is_null': return raw == null || v === ''
    case 'is_not_null': return raw != null && v !== ''
    default: return true
  }
}

/** Recursively evaluate a FilterGroup against a row. */
function matchFilterGroup(row: Record<string, unknown>, group: FilterGroup): boolean {
  const combine = group.logic === 'or'
    ? (a: boolean, b: boolean) => a || b
    : (a: boolean, b: boolean) => a && b
  const identity = group.logic === 'or' ? false : true

  let result = identity
  for (const cond of group.conditions) {
    result = combine(result, matchCondition(row, cond))
  }
  for (const sub of group.groups ?? []) {
    result = combine(result, matchFilterGroup(row, sub))
  }
  return result
}

/** Client-side text search across all string-like values in a row. */
function matchSearch(row: Record<string, unknown>, text: string): boolean {
  if (!text) return true
  const lower = text.toLowerCase()
  for (const v of Object.values(row)) {
    if (v != null && String(v).toLowerCase().includes(lower)) return true
  }
  return false
}

/** Recursively remove a condition by ID from a FilterGroup */
function removeCondFromGroup(group: FilterGroup, condId: string): FilterGroup {
  return {
    ...group,
    conditions: group.conditions.filter((c) => c.id !== condId),
    groups: group.groups.map((sg) => removeCondFromGroup(sg, condId)),
  }
}

export default function AppViewPage() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const excelToolbar = useExcelToolbar()
  const { data: workbooks } = useWorkbooks()
  /** Current page number for server-side pagination (1-based). */
  const [page, setPage] = useState(1)
  /** Rows per page; user-selectable via DataTable page size dropdown. */
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  /** Column-header sorting state consumed by @tanstack/react-table. */
  const [sorting, setSorting] = useState<SortingState>([])
  /** ID of the entry pending deletion (drives the ConfirmDialog). */
  /** Hidden file input ref for CSV import trigger. */
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** Whether the keyboard shortcut help dialog is open. */
  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false)

  // Filter state — uses FilterGroup for AND/OR support
  const [filterGroup, setFilterGroup] = useState<FilterGroup>(emptyFilterGroup())
  // Derived flat list for backward compatibility
  const filterConditions = flattenFilterGroup(filterGroup)
  const hasActiveFilters = !isFilterGroupEmpty(filterGroup)

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

  // Settings & Automations panel state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [automationsOpen, setAutomationsOpen] = useState(false)

  // Add column dialog
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState<FieldType>('text')

  // Cell formatting state — tracks active cell for formatting toolbar.
  const [fmtActiveCell, setFmtActiveCell] = useState<CellPosition | null>(null)
  const [fmtSelection, setFmtSelection] = useState<SelectionRange | null>(null)
  const handleActiveCellChange = useCallback(
    (cell: CellPosition | null, sel: SelectionRange | null) => {
      setFmtActiveCell(cell)
      setFmtSelection(sel)
    },
    [],
  )

  // Saved views state
  const [activeView, setActiveView] = useState<SavedView | null>(null)
  const [newViewName, setNewViewName] = useState('')

  const { data: collection, isLoading: colLoading, isError: colError, error: colErr } =
    useCollection(appId)
  const { data: process } = useProcess(appId)
  const { data: currentUser } = useCurrentUser()
  const canManage = canManageCollection(currentUser, collection?.created_by)

  // Workbook lock — one user edits at a time.
  const { isLockedByOther } = useWorkbookLock(collection?.workbook_id)
  const isReadOnly = isLockedByOther

  // Show toast when automation runs are detected.
  useAutomationRunToasts(collection?.id)

  // Let the backend auto-expand all relation fields.
  const expand = 'auto'

  const { data: savedViews } = useSavedViews(collection?.id)
  const createSavedView = useCreateSavedView(collection?.id ?? '')
  const deleteSavedView = useDeleteSavedView(collection?.id ?? '')

  // Column management
  const addField = useAddField(collection?.id ?? '')
  const updateField = useUpdateField(collection?.id ?? '')
  const deleteField = useDeleteField()

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

  // Build filters from FilterGroup + search text.
  // Use JSON _filter param when the group has OR logic or nested groups;
  // fall back to legacy key-value params for simple AND-only flat conditions.
  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    const needsJsonFilter = filterGroup.logic === 'or' || filterGroup.groups.length > 0
    const serialized = serializeFilterGroup(filterGroup)

    if (needsJsonFilter && serialized) {
      f._filter = serialized
    } else {
      for (const cond of filterConditions) {
        if (cond.operator === 'is_null') {
          f[cond.field] = 'is_null:'
        } else if (cond.value) {
          f[cond.field] = `${cond.operator}:${cond.value}`
        }
      }
    }
    if (searchText) {
      f.q = searchText
    }
    return Object.keys(f).length > 0 ? f : undefined
  }, [filterGroup, filterConditions, searchText])

  // --- Client-side mode detection ---
  // First fetch: normal server-side to discover the total.
  // If total ≤ CLIENT_MODE_THRESHOLD we switch to client-side filtering/sorting
  // by fetching ALL rows once and letting tanstack/react-table handle the rest.
  const [isClientMode, setIsClientMode] = useState(false)

  const serverParams = useMemo(() => {
    if (isClientMode) {
      // In client mode, fetch all data without server-side filter/sort/pagination.
      return { limit: CLIENT_MODE_THRESHOLD, expand }
    }
    return { page, limit, sort: sortParam, expand, filters }
  }, [isClientMode, page, limit, sortParam, expand, filters])

  const {
    data: list,
    isLoading: entriesLoading,
    isError: entriesError,
    error: entriesErr,
    refetch,
  } = useEntries(collection?.slug, serverParams)

  // Switch to client mode once we know the total is small enough.
  useEffect(() => {
    if (list && !isClientMode && list.total <= CLIENT_MODE_THRESHOLD) {
      setIsClientMode(true)
    }
    // If a mutation pushed total above the threshold, switch back.
    if (list && isClientMode && list.total > CLIENT_MODE_THRESHOLD) {
      setIsClientMode(false)
    }
  }, [list?.total]) // eslint-disable-line react-hooks/exhaustive-deps

  const createEntry = useCreateEntry(collection?.slug ?? '')
  const updateEntry = useUpdateEntry(collection?.slug ?? '')
  const batchUpdateEntry = useBatchUpdateEntry(collection?.slug ?? '')
  const bulkDelete = useBulkDeleteEntries(collection?.slug ?? '')
  const retryToast = useRetryToast()
  const onConflictError = useConflictAwareUpdate(refetch)

  // --- Free grid buffer (enabled when ≤ CLIENT_MODE_THRESHOLD) ---
  const gridBuffer = useGridBuffer({
    serverData: isClientMode ? (list?.data ?? []) : [],
    fields: collection?.fields ?? [],
    enabled: isClientMode,
    slug: collection?.slug ?? '',
  })

  // In free-grid mode, data comes from gridBuffer with client-side filters applied.
  const clientFilteredBufferData = useMemo(() => {
    if (!isClientMode) return []
    let rows = gridBuffer.rows
    if (hasActiveFilters) {
      rows = rows.filter((row) => matchFilterGroup(row, filterGroup))
    }
    if (searchText) {
      rows = rows.filter((row) => matchSearch(row, searchText))
    }
    return rows
  }, [isClientMode, gridBuffer.rows, hasActiveFilters, filterGroup, searchText])

  const viewData = isClientMode ? clientFilteredBufferData : (list?.data ?? [])
  const viewTotal = isClientMode ? clientFilteredBufferData.length : (list?.total ?? 0)

  // Multi-select state for bulk operations.
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [selectAllFilteredMode] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  // Cell formatting hook — derive column IDs from collection fields to match DataTable layout.
  const fmtColumnIds = useMemo(() => {
    if (!collection?.fields) return []
    const ids = ['_rowNum']
    for (const f of collection.fields) {
      if (f.field_type !== 'label' && f.field_type !== 'line' && f.field_type !== 'spacer') {
        ids.push(f.slug)
      }
    }
    ids.push('created_at')
    return ids
  }, [collection?.fields])

  const cellFormatting = useCellFormatting({
    data: viewData as EntryRow[],
    activeCell: fmtActiveCell,
    selection: fmtSelection,
    columnIds: fmtColumnIds,
    batchUpdate: (updates) => batchUpdateEntry.mutate(updates),
  })

  // Keyboard shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null)
  useHotkeys([
    { key: '?', handler: () => setHotkeyHelpOpen(true) },
    { key: 'mod+n', handler: () => navigate(`/apps/${appId}/entries/new`) },
    { key: 'mod+f', handler: () => searchInputRef.current?.focus() },
    { key: 'mod+s', handler: () => { if (isClientMode && gridBuffer.isDirty) gridBuffer.save() } },
  ])

  // Formula fields are read-only in the grid.
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

  // Build summary row from server-side totals only.
  const summaryRow = useMemo(() => {
    if (numericFields.length === 0 || !list?.data?.length) return undefined
    const summary: Record<string, { label: string; value: string | number }> = {}
    const fnLabels: Record<string, string> = { sum: '합계', avg: '평균', count: '개수', min: '최소', max: '최대' }

    for (const f of numericFields) {
      const fn = columnAggFn[f.slug] || 'sum'
      const fnLabel = fnLabels[fn] || fn

      const serverField = totals?.[f.slug]
      const serverAgg = typeof serverField === 'object' && serverField !== null
        && 'sum' in serverField && 'avg' in serverField
        ? serverField as { sum: number; avg: number; min: number; max: number }
        : null
      const serverCount = typeof totals?._count === 'number' ? totals._count : undefined

      let displayValue: number | undefined

      switch (fn) {
        case 'sum':
          displayValue = serverAgg?.sum
          break
        case 'avg':
          displayValue = serverAgg?.avg
          break
        case 'count':
          displayValue = serverCount ?? list.total
          break
        case 'min':
          displayValue = serverAgg?.min
          break
        case 'max':
          displayValue = serverAgg?.max
          break
        default:
          displayValue = serverAgg?.sum
      }

      const label = displayValue != null
        ? `${fnLabel} ${displayValue.toLocaleString('ko', { maximumFractionDigits: fn === 'count' ? 0 : 1 })}`
        : `${fnLabel} -`
      summary[f.slug] = { label, value: displayValue ?? '-' }
    }
    return Object.keys(summary).length > 0 ? summary : undefined
  }, [numericFields, list, columnAggFn, totals])

  // Helper: find _version for a row from the current list data.
  const getRowVersion = useCallback(
    (rowId: string): number | undefined => {
      const row = list?.data?.find((r) => r.id === rowId)
      return row?._version as number | undefined
    },
    [list],
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

  // Excel export.
  function handleXlsxExport() {
    if (!collection) return
    const qs = buildExportQS()
    window.open(`/api/data/${collection.slug}/export.xlsx${qs ? `?${qs}` : ''}`, '_blank')
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
    const toastId = toast.loading('파일 가져오는 중...')

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
      await refetch()
    } catch (err) {
      toast.error(formatError(err), { id: toastId })
    } finally {
      setImportingCSV(false)
      setCsvPreviewFile(null)
    }
  }, [collection, refetch])

  // Sync toolbar content to ExcelLayout context.
  // These hooks must stay above the early returns to maintain consistent hook order.
  const workbookLabel = useMemo(() => {
    if (!collection?.workbook_id || !workbooks) return ''
    return workbooks.find((w) => w.id === collection.workbook_id)?.label ?? ''
  }, [collection?.workbook_id, workbooks])

  useEffect(() => {
    if (!collection) return
    excelToolbar.setCollectionLabel(collection.label)
    excelToolbar.setWorkbookLabel(workbookLabel)
  }, [collection?.label, workbookLabel, excelToolbar])

  // Toolbar/tabs/actions sync — refs are assigned after the early return,
  // then the effects (which always run) push the ref values into context.
  const toolbarContentRef = useRef<React.ReactNode>(null)
  const sheetTabsRef = useRef<React.ReactNode>(null)
  const pageActionsRef = useRef<React.ReactNode>(null)
  // Reset refs each render; they'll be re-assigned below only when collection is loaded.
  toolbarContentRef.current = null
  sheetTabsRef.current = null
  pageActionsRef.current = null

  useEffect(() => { excelToolbar.setToolbarContent(toolbarContentRef.current) })
  useEffect(() => { excelToolbar.setSheetTabs(sheetTabsRef.current) })
  useEffect(() => { excelToolbar.setPageActions(pageActionsRef.current) })

  if (colLoading) return <LoadingState variant="table" />
  if (colError) return <ErrorState error={colErr} />
  if (!collection) return null

  function handleEntryClick(entry: Record<string, unknown>) {
    navigate(`/apps/${appId}/entries/${entry.id}`)
  }

  // --- Entry panel handlers ---
  function handleRenameColumn(columnSlug: string, newLabel: string) {
    const field = collection?.fields?.find(f => f.slug === columnSlug)
    if (!field) return
    updateField.mutate(
      { fieldId: field.id, body: { label: newLabel } },
      {
        onSuccess: () => toast.success('열 이름이 변경되었습니다'),
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  function handleDeleteColumn(columnSlug: string) {
    const field = collection?.fields?.find(f => f.slug === columnSlug)
    if (!field) return
    if (!confirm(`"${field.label}" 열을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
    deleteField.mutate(
      { fieldId: field.id, confirm: true },
      {
        onSuccess: () => toast.success('열이 삭제되었습니다'),
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  function handleAddColumn() {
    setNewColName('')
    setNewColType('text')
    setAddColumnOpen(true)
  }

  function handleAddColumnSubmit() {
    if (!newColName.trim()) return
    const slug = newColName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')
    addField.mutate(
      {
        input: {
          slug,
          label: newColName.trim(),
          field_type: newColType,
        },
        confirm: true,
      },
      {
        onSuccess: () => {
          toast.success('열이 추가되었습니다')
          setAddColumnOpen(false)
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
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
      onError: (err) => onConflictError(err),
    })
  }

  function applyView(view: SavedView) {
    setActiveView(view)
    if (view.filter_config && Object.keys(view.filter_config).length > 0) {
      const config = view.filter_config as Record<string, unknown>
      // New format: filter_config has a "logic" key
      if ('logic' in config && 'conditions' in config && Array.isArray((config as Record<string, unknown>).conditions)) {
        const fg = config as unknown as FilterGroup
        // Re-assign IDs to prevent collisions
        let idx = 0
        function reId(g: FilterGroup): FilterGroup {
          return {
            ...g,
            id: `sv-g-${idx++}`,
            conditions: g.conditions.map((c) => ({ ...c, id: `sv-${idx++}` })),
            groups: (g.groups ?? []).map(reId),
          }
        }
        setFilterGroup(reId(fg))
      } else {
        // Legacy format: flat key-value map
        const restored: FilterCondition[] = Object.entries(config).map(
          ([key, value], i) => {
            const parts = key.split(':')
            const field = parts[0]
            const operator = parts.slice(1).join(':') || 'eq'
            return { id: `sv-${i}`, field, operator, value: String(value) }
          },
        )
        setFilterGroup({ ...emptyFilterGroup(), conditions: restored })
      }
    } else {
      setFilterGroup(emptyFilterGroup())
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
    setFilterGroup(emptyFilterGroup())
    setSortItems([])
    setPage(1)
  }

  function handleSaveView() {
    if (!newViewName.trim()) return
    // Save FilterGroup as the filter_config (supports AND/OR)
    let filterConfig: Record<string, unknown> = {}
    if (!isFilterGroupEmpty(filterGroup)) {
      if (filterGroup.logic === 'or' || filterGroup.groups.length > 0) {
        // Save as new FilterGroup format
        filterConfig = { logic: filterGroup.logic, conditions: filterGroup.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })), groups: filterGroup.groups }
      } else {
        // Save as legacy flat format for backward compat
        for (const c of filterConditions) {
          if (c.field && c.operator) {
            (filterConfig as Record<string, string>)[`${c.field}:${c.operator}`] = c.value
          }
        }
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
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  // Sheet tabs (SavedViews) rendered in toolbar right area.
  sheetTabsRef.current = (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none shrink-0">
      <button
        type="button"
        className={`inline-flex items-center h-8 px-2.5 text-xs rounded-md border transition-colors ${
          !activeView ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input hover:bg-accent'
        }`}
        onClick={() => clearView()}
      >
        전체
      </button>
      {savedViews?.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`inline-flex items-center gap-1 h-8 px-2.5 text-xs rounded-md border transition-colors ${
            activeView?.id === v.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input hover:bg-accent'
          }`}
          onClick={() => {
            if (activeView?.id === v.id) clearView()
            else applyView(v)
          }}
        >
          {v.name}
          {activeView?.id === v.id && (
            <span
              role="button"
              className="ml-0.5 hover:text-destructive-foreground"
              aria-label="시트 삭제"
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
            </span>
          )}
        </button>
      ))}
      {(hasActiveFilters || sortItems.length > 0) && (
        <Popover>
          <PopoverTrigger
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-dashed border-input hover:bg-accent"
            aria-label="뷰 추가"
          >
            <Plus className="h-3.5 w-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
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
  )

  // Toolbar rendered inside DataTable.
  toolbarContentRef.current = (
    <>
    <div className="flex items-center gap-2 flex-wrap w-full">
      {selectedRowIds.size > 0 ? (
        /* ── 일괄 액션 모드 ── */
        <>
          <span className="text-sm font-medium">{selectAllFilteredMode ? `전체 ${selectedRowIds.size}건 선택` : `${selectedRowIds.size}건 선택`}</span>
          {process?.is_enabled && (process.statuses?.length ?? 0) > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-sm font-medium hover:bg-accent h-8"
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
              className="h-8 gap-1"
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
              className="h-8 gap-1"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              일괄 삭제
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => setSelectedRowIds(new Set())}
          >
            선택 해제
          </Button>
        </>
      ) : (
        /* ── 기본 툴바 ── */
        <>
      {/* ── Group 0: 셀 서식 ── */}
      {canManage && !isReadOnly && (
        <>
          <FormattingToolbar
            currentFormat={cellFormatting.currentFormat}
            onFormatChange={cellFormatting.applyFormat}
            disabled={!fmtActiveCell}
          />
          <div className="w-px h-4 bg-[#d4d4d4]" />
        </>
      )}

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
            aria-label="검색 초기화"
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
      {searchText && list && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {viewTotal}건 검색됨
        </span>
      )}

      <Popover>
        <PopoverTrigger
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent h-8"
        >
            <Filter className="h-3.5 w-3.5" />
            필터
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {filterConditions.length}
              </Badge>
            )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto min-w-[420px] p-3">
          <div className="mb-2 text-sm font-medium">필터 조건</div>
          <FilterBuilder
            fields={collection.fields ?? []}
            filterGroup={filterGroup}
            slug={collection.slug}
            onFilterGroupChange={(g) => {
              setFilterGroup(g)
              setPage(1)
            }}
          />
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-destructive"
              onClick={() => {
                setFilterGroup(emptyFilterGroup())
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
          <DropdownMenuContent align="start" className="min-w-[160px]">
            <DropdownMenuItem onClick={handleXlsxExport} className="whitespace-nowrap">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
              Excel 내보내기
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCsvExport} className="whitespace-nowrap">
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
            {canManage && (
              <DropdownMenuItem onClick={() => setAutomationsOpen(true)}>
                <Zap className="h-3.5 w-3.5 mr-2" />
                자동화
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleImportCSV}
        />
      </div>

        </>
      )}
    </div>
    {selectedRowIds.size === 0 && (
    <FilterChips
      filterGroup={filterGroup}
      sortItems={sortItems}
      fields={collection.fields ?? []}
      onRemoveFilter={(id) => {
        setFilterGroup((prev) => removeCondFromGroup(prev, id))
        setPage(1)
      }}
      onRemoveSort={(index) => {
        setSortItems((prev) => prev.filter((_, i) => i !== index))
      }}
      onClearAll={() => {
        setFilterGroup(emptyFilterGroup())
        setSortItems([])
        setPage(1)
      }}
    />
    )}
    </>
  )

  pageActionsRef.current = (
    <>
      <Link to={`/apps/${collection.id}/interface`}>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-[11px]">
          <LayoutGrid className="h-3.5 w-3.5" />
          인터페이스
        </Button>
      </Link>
      {canManage && (
        <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => setSettingsOpen(true)}>설정</Button>
      )}
      <Button size="sm" className="h-8 text-[11px]" onClick={() => navigate(`/apps/${appId}/entries/new`)}>
        {TERM.newRecord}
      </Button>
    </>
  )

  return (
    <div className="flex flex-col h-full">
      {isReadOnly && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          다른 사용자가 편집 중입니다. 읽기 전용으로 표시됩니다.
        </div>
      )}

      {isClientMode && gridBuffer.isDirty && (
        <div className="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-3 py-1 text-[11px] text-blue-800">
          <span className="font-medium">{gridBuffer.dirtyCount}건 미저장</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-blue-800 hover:bg-blue-100"
            disabled={gridBuffer.isSaving}
            onClick={() => gridBuffer.save()}
          >
            {gridBuffer.isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            저장 (Ctrl+S)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-blue-800 hover:bg-blue-100"
            disabled={gridBuffer.isSaving}
            onClick={() => {
              if (confirm('변경���항을 모두 취소하시겠습니까?')) gridBuffer.discardChanges()
            }}
          >
            취소
          </Button>
        </div>
      )}

      {entriesLoading && !list && <LoadingState variant="table" />}
      {entriesError && <ErrorState error={entriesErr} onRetry={() => refetch()} />}

      {list && (
        <ErrorBoundary key="spreadsheet">
          <div className="flex-1 min-h-0">
          <SpreadsheetView
            collection={collection}
            data={viewData}
            total={viewTotal}
            page={page}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={setLimit}
            onSortChange={handleHeaderSortChange}
            onRowClick={handleEntryClick}
            updateEntry={isClientMode
              ? async ({ id, body }) => {
                  for (const [slug, value] of Object.entries(body)) {
                    gridBuffer.setCellValue(id, slug, value)
                  }
                }
              : async (params) => { await updateEntry.mutateAsync(params) }
            }
            createEntry={isClientMode
              ? async (body) => { gridBuffer.addRow(body) }
              : async (body) => { await createEntry.mutateAsync(body) }
            }
            deleteEntry={isClientMode
              ? (id) => gridBuffer.deleteRow(id)
              : (id) => bulkDelete.mutate([id])
            }
            batchUpdateEntry={isClientMode
              ? (updates) => {
                  for (const u of updates) {
                    for (const [slug, value] of Object.entries(u.fields)) {
                      gridBuffer.setCellValue(u.id, slug, value)
                    }
                  }
                }
              : (updates) => batchUpdateEntry.mutate(updates)
            }
            canManage={canManage && !isReadOnly}
            toolbar={null}
            toolbarRight={null}
            summaryRow={summaryRow}
            summaryFn={columnAggFn}
            onSummaryFnChange={handleAggFnChange}
            emptyTitle={searchText || hasActiveFilters ? '검색 결과가 없습니다' : TERM.noRecords}
            emptyDescription={searchText || hasActiveFilters ? '검색어 또는 필터 조건을 변경해 보세요.' : TERM.noRecordsDesc}
            onInsertRow={isClientMode
              ? () => { gridBuffer.addRow({}) }
              : () => { createEntry.mutateAsync({}) }
            }
            freeGridMode={isClientMode}
            cellDirtyFn={isClientMode ? gridBuffer.isCellDirty : undefined}
            cellErrorFn={isClientMode ? (rowId: string, slug: string) => gridBuffer.cellErrors.get(rowId)?.get(slug) ?? null : undefined}
            onFilterByValue={(fieldSlug, value) => {
              setFilterGroup((prev) => ({
                ...prev,
                conditions: [
                  ...prev.conditions,
                  {
                    id: crypto.randomUUID(),
                    field: fieldSlug,
                    operator: value == null ? 'is_null' : 'eq',
                    value: value == null ? '' : String(value),
                  },
                ],
              }))
              setPage(1)
            }}
            emptyAction={
              searchText || hasActiveFilters ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchText('')
                    setSearchInputValue('')
                    setFilterGroup(emptyFilterGroup())
                  }}
                >
                  필터 초기화
                </Button>
              ) : undefined
            }
            onRenameColumn={canManage && !isReadOnly ? handleRenameColumn : undefined}
            onDeleteColumn={canManage && !isReadOnly ? handleDeleteColumn : undefined}
            onAddColumn={canManage && !isReadOnly ? handleAddColumn : undefined}
            onActiveCellChange={handleActiveCellChange}
            onFormatShortcut={(key) => {
              if (key === 'bold') cellFormatting.applyFormat({ bold: true })
              else if (key === 'italic') cellFormatting.applyFormat({ italic: true })
            }}
            clientMode={isClientMode}
          />
          </div>
        </ErrorBoundary>
      )}

      <SheetTabs workbookId={collection.workbook_id} currentCollectionId={collection.id} />

      <ImportPreview
        open={csvPreviewOpen}
        onOpenChange={setCsvPreviewOpen}
        file={csvPreviewFile}
        fields={collection.fields ?? []}
        slug={collection.slug}
        onConfirm={handleCSVConfirm}
      />

      <BulkEditPanel
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        fields={collection.fields ?? []}
        collectionId={collection.id}
        selectedCount={selectedRowIds.size}
        onApply={handleBulkEdit}
        loading={batchUpdateEntry.isPending}
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

      {/* Add column dialog */}
      <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>열 추가</DialogTitle>
            <DialogDescription>새 열의 이름과 타입을 지정하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="col-name">열 이름</Label>
              <Input
                id="col-name"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddColumnSubmit()}
                placeholder="예: 담당자"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="col-type">타입</Label>
              <select
                id="col-type"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={newColType}
                onChange={(e) => setNewColType(e.target.value as FieldType)}
              >
                <option value="text">텍스트</option>
                <option value="textarea">긴 텍스트</option>
                <option value="number">숫자</option>
                <option value="integer">정수</option>
                <option value="boolean">체크박스</option>
                <option value="date">날짜</option>
                <option value="datetime">날짜시간</option>
                <option value="select">선택</option>
                <option value="multiselect">다중선택</option>
                <option value="user">사용자</option>
                <option value="relation">관계</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColumnOpen(false)}>취소</Button>
            <Button onClick={handleAddColumnSubmit} disabled={!newColName.trim() || addField.isPending}>
              {addField.isPending ? '추가 중...' : '추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SheetPanel open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>시트 설정</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <SettingsPanel
              collection={collection}
              onDelete={() => {
                setSettingsOpen(false)
                navigate('/apps')
              }}
            />
          </div>
        </SheetContent>
      </SheetPanel>

      <SheetPanel open={automationsOpen} onOpenChange={setAutomationsOpen}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>자동화</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <AutomationsPanel collectionId={collection.id} />
          </div>
        </SheetContent>
      </SheetPanel>

      {/* Nested entry route (slide-over) */}
      <Outlet />
    </div>
  )
}
