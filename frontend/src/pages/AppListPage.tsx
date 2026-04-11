import {
  ChevronDown, ChevronRight, Edit2,
  Layers, MoreHorizontal, Plus, Search,
  Sparkles, Trash2,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import TemplateGallery from '@/components/works/TemplateGallery'
import { AppIcon } from '@/components/works/AppCard'
import { Button } from '@/components/ui/button'
// Card removed — using list rows instead
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useAIAvailable } from '@/contexts/AIAvailabilityContext'
import {
  useCollections,
  useWorkbooks,
  useSheetCounts,
  useCreateWorkbook,
  useUpdateWorkbook,
  useDeleteWorkbook,
} from '@/hooks/useCollections'
import { useCurrentUser } from '@/hooks/useAuth'
import { TERM } from '@/lib/constants'
import type { Workbook } from '@/lib/types'

// -- Collapsed state persistence --
const COLLAPSED_KEY = 'workbook-group-collapsed'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}
function saveCollapsed(set: Set<string>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]))
}

export default function AppListPage() {
  const { data: workbooks, isLoading, isError, error, refetch } = useWorkbooks()
  const { data: collections } = useCollections()
  const { data: sheetCounts } = useSheetCounts()
  const { data: user } = useCurrentUser()
  const aiAvailable = useAIAvailable()
  const canManage = user?.role === 'director' || user?.role === 'pm'
  const navigate = useNavigate()

  const [showTemplates, setShowTemplates] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  // App dialog state
  const [appDialogOpen, setAppDialogOpen] = useState(false)
  const [appEditId, setAppEditId] = useState<string | null>(null)
  const [appLabel, setAppLabel] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const createApp = useCreateWorkbook()
  const updateApp = useUpdateWorkbook()
  const deleteApp = useDeleteWorkbook()

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveCollapsed(next)
      return next
    })
  }, [])

  // -- Filter apps by search --
  const filteredApps = useMemo(() => {
    if (!workbooks) return []
    if (!search.trim()) return workbooks
    const q = search.trim().toLowerCase()
    return workbooks.filter((wb) => wb.label.toLowerCase().includes(q))
  }, [workbooks, search])

  // -- Group apps by group_label (워크북) --
  const { grouped, ungrouped, groupLabels } = useMemo(() => {
    const map = new Map<string, Workbook[]>()
    const ungroup: Workbook[] = []
    for (const app of filteredApps) {
      if (app.group_label) {
        const arr = map.get(app.group_label) ?? []
        arr.push(app)
        map.set(app.group_label, arr)
      } else {
        ungroup.push(app)
      }
    }
    const labels = [...map.keys()].sort()
    return { grouped: map, ungrouped: ungroup, groupLabels: labels }
  }, [filteredApps])

  // Find first sheet for an app to navigate to
  const firstSheetId = useCallback((appId: string): string | null => {
    if (!collections) return null
    const sheet = collections.find((c) => c.workbook_id === appId)
    return sheet?.id ?? null
  }, [collections])

  const isSearching = search.trim().length > 0
  const hasApps = workbooks && workbooks.length > 0

  // -- App dialog handlers --
  function openCreateApp() {
    setAppEditId(null)
    setAppLabel('')
    setAppDialogOpen(true)
  }
  function openEditApp(app: Workbook) {
    setAppEditId(app.id)
    setAppLabel(app.label)
    setAppDialogOpen(true)
  }
  async function handleAppSave() {
    if (!appLabel.trim()) return
    if (appEditId) {
      await updateApp.mutateAsync({ id: appEditId, label: appLabel.trim() })
    } else {
      await createApp.mutateAsync({ label: appLabel.trim() })
    }
    setAppDialogOpen(false)
  }
  async function handleAppDelete() {
    if (!deleteConfirm) return
    await deleteApp.mutateAsync(deleteConfirm)
    setDeleteConfirm(null)
  }

  function handleAppClick(app: Workbook) {
    const sheetId = firstSheetId(app.id)
    if (sheetId) {
      navigate(`/apps/${sheetId}`)
    } else {
      toast.info('시트가 없습니다. 사이드바에서 시트를 추가하세요.')
    }
  }

  return (
    <>
    <div className="h-full overflow-y-auto bg-[#f3f3f3]">
        {/* Template gallery */}
        {showTemplates && (
          <div className="p-6 border-b border-[#d4d4d4] bg-white">
            <h3 className="mb-3 text-sm font-medium text-[#666]">
              템플릿으로 빠르게 시작하세요
            </h3>
            <TemplateGallery />
          </div>
        )}

        {isLoading && <LoadingState variant="card-grid" />}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}

        {workbooks && workbooks.length === 0 && !showTemplates && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Layers className="h-12 w-12 text-[#c0c0c0] mb-4" />
            <h2 className="text-lg font-medium text-[#333] mb-1">{TERM.noApps}</h2>
            <p className="text-sm text-[#666] mb-4">{TERM.noAppsDesc}</p>
            <Button onClick={openCreateApp} className="bg-[#217346] hover:bg-[#1a5c38]">{TERM.newApp}</Button>
            {aiAvailable && (
              <Link to="/apps/new" className="mt-4 text-sm text-[#217346] hover:underline flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                AI로 첫 앱 만들기
              </Link>
            )}
          </div>
        )}

        {hasApps && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-[#333] mb-1">최근</h2>
                <p className="text-sm text-[#666]">최근 사용한 앱</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className={showTemplates ? 'bg-accent' : ''}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  템플릿
                </Button>
                {canManage && (
                  <Button size="sm" onClick={openCreateApp} className="bg-[#217346] hover:bg-[#1a5c38]">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    새 앱
                  </Button>
                )}
              </div>
            </div>

            {/* Search bar */}
            <div className="relative mb-4 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999]" />
              <Input
                placeholder="앱 검색…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 bg-white border-[#d4d4d4] text-sm"
              />
            </div>

            {filteredApps.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#666]">
                '{search}'에 해당하는 앱이 없습니다
              </p>
            ) : (
              <div className="space-y-4">
                {/* Grouped apps (워크북) */}
                {groupLabels.map((label) => {
                  const apps = grouped.get(label) ?? []
                  const isOpen = isSearching || !collapsed.has(label)
                  const singleMatch = apps.length === 1 && apps[0].label === label
                  return (
                    <div key={label}>
                      {!singleMatch && (
                        <button
                          onClick={() => toggleCollapse(label)}
                          className="mb-2 flex items-center gap-2 text-xs font-medium text-[#666] hover:text-[#333] transition-colors"
                        >
                          {isOpen
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                          {label}
                          <span className="text-[10px] font-normal text-[#999]">({apps.length})</span>
                        </button>
                      )}
                      {(singleMatch || isOpen) && (
                        <AppList
                          apps={apps}
                          sheetCounts={sheetCounts}
                          canManage={canManage}
                          onEdit={openEditApp}
                          onDelete={(id) => setDeleteConfirm(id)}
                          onClick={handleAppClick}
                        />
                      )}
                    </div>
                  )
                })}

                {/* Ungrouped apps */}
                {ungrouped.length > 0 && (
                  <div>
                    {groupLabels.length > 0 && (
                      <div className="mb-2 flex items-center gap-2 text-xs text-[#666]">
                        <span className="font-medium">{TERM.uncategorized}</span>
                        <span className="text-[10px]">({ungrouped.length})</span>
                      </div>
                    )}
                    <AppList
                      apps={ungrouped}
                      sheetCounts={sheetCounts}
                      canManage={canManage}
                      onEdit={openEditApp}
                      onDelete={(id) => setDeleteConfirm(id)}
                      onClick={handleAppClick}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
    </div>

      {/* App create/edit dialog */}
      <Dialog open={appDialogOpen} onOpenChange={setAppDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{appEditId ? '앱 수정' : '새 앱'}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="앱 이름"
            value={appLabel}
            onChange={(e) => setAppLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAppSave()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleAppSave}
              disabled={!appLabel.trim() || createApp.isPending || updateApp.isPending}
            >
              {createApp.isPending || updateApp.isPending ? '처리 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="앱 삭제"
        description="앱을 삭제하면 소속 시트들도 함께 삭제됩니다."
        confirmLabel="삭제"
        variant="destructive"
        onConfirm={handleAppDelete}
        loading={deleteApp.isPending}
      />
    </>
  )
}

// -- App List (Excel Start Screen style) --
function AppList({
  apps,
  sheetCounts,
  canManage,
  onEdit,
  onDelete,
  onClick,
}: {
  apps: Workbook[]
  sheetCounts?: Record<string, number>
  canManage: boolean
  onEdit: (app: Workbook) => void
  onDelete: (id: string) => void
  onClick: (app: Workbook) => void
}) {
  return (
    <div className="space-y-0">
      {apps.map((app) => {
        const updatedAt = app.updated_at ? new Date(app.updated_at) : null
        const timeSince = updatedAt ? formatTimeSince(updatedAt) : null
        const sheets = sheetCounts?.[app.id] ?? 0

        return (
          <div
            key={app.id}
            className="group flex items-center gap-3 px-3 py-2.5 bg-white border-b border-[#e8e8e8] cursor-pointer hover:bg-[#e8f0fe] transition-colors"
            onClick={() => onClick(app)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#217346] text-white shrink-0">
              <AppIcon name={app.icon} className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#333] truncate">{app.label}</div>
              <div className="text-[11px] text-[#999]">
                {sheets}개 시트
                {timeSince && <> &middot; {timeSince}</>}
              </div>
            </div>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="rounded p-1 text-[#999] opacity-0 group-hover:opacity-100 hover:bg-[#d4d4d4] transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(app) }}>
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    이름 변경
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(app.id) }} className="text-destructive">
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    삭제
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatTimeSince(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}시간 전`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 30) return `${diffDays}일 전`
  return date.toLocaleDateString('ko')
}
