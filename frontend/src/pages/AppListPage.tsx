import {
  ChevronDown, ChevronRight, ChevronUp, Edit2,
  Layers, MoreHorizontal, Plus, Search,
  Sparkles, Trash2,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import TemplateGallery from '@/components/works/TemplateGallery'
import { AppIcon } from '@/components/works/AppCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
    }
  }

  return (
    <div>
      <PageHeader
        title={TERM.apps}
        description="앱을 만들고 시트로 데이터를 관리하세요"
        actions={
          <>
            <Button
              variant={showTemplates ? 'secondary' : 'outline'}
              onClick={() => setShowTemplates(!showTemplates)}
              className="gap-1"
            >
              템플릿
              {showTemplates
                ? <ChevronUp className="h-3.5 w-3.5" />
                : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button onClick={openCreateApp}>
              <Plus className="mr-1 h-4 w-4" />
              {TERM.newApp}
            </Button>
          </>
        }
      />

      {/* Template gallery */}
      {showTemplates && (
        <div className="mb-6 animate-slide-down">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            템플릿으로 빠르게 시작하세요
          </h3>
          <TemplateGallery />
        </div>
      )}

      {isLoading && <LoadingState variant="card-grid" />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {workbooks && workbooks.length === 0 && !showTemplates && (
        <div className="mx-auto max-w-lg mt-8 animate-fade-in-up">
          <EmptyState
            title={TERM.noApps}
            description={TERM.noAppsDesc}
            icon={<Layers className="h-10 w-10" />}
            action={
              <Button onClick={openCreateApp}>{TERM.newApp}</Button>
            }
          />
          {aiAvailable && (
            <div className="mt-6 flex items-center gap-4 rounded-lg border p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium">AI로 첫 앱 만들기</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  어떤 데이터를 관리하고 싶은지 설명하면 AI가 앱 구조를 제안합니다
                </p>
              </div>
              <Link to="/apps/new">
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                  <Sparkles className="h-3.5 w-3.5" />
                  시작하기
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {hasApps && (
        <>
          {/* Search bar */}
          <div className="relative mb-5 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="앱 검색…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {filteredApps.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              '{search}'에 해당하는 앱이 없습니다
            </p>
          ) : (
            <div className="space-y-6">
              {/* Grouped apps (워크북) */}
              {groupLabels.map((label) => {
                const apps = grouped.get(label) ?? []
                const isOpen = isSearching || !collapsed.has(label)
                return (
                  <div key={label}>
                    <button
                      onClick={() => toggleCollapse(label)}
                      className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
                    >
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      {label}
                      <span className="text-xs font-normal text-muted-foreground">({apps.length})</span>
                    </button>
                    {isOpen && (
                      <AppGrid
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
                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-medium">{TERM.uncategorized}</span>
                      <span className="text-xs">({ungrouped.length})</span>
                    </div>
                  )}
                  <AppGrid
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
        </>
      )}

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
    </div>
  )
}

// -- App Grid --
function AppGrid({
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
    <div className="grid justify-center gap-4 grid-cols-[repeat(auto-fill,minmax(280px,340px))]">
      {apps.map((app, i) => (
        <div key={app.id} className={`animate-scale-in stagger-${Math.min(i + 1, 12)}`}>
          <AppCardNew
            app={app}
            sheetCount={sheetCounts?.[app.id] ?? 0}
            canManage={canManage}
            onEdit={() => onEdit(app)}
            onDelete={() => onDelete(app.id)}
            onClick={() => onClick(app)}
          />
        </div>
      ))}
    </div>
  )
}

// -- App Card (shows app with sheet count) --
function AppCardNew({
  app,
  sheetCount,
  canManage,
  onEdit,
  onDelete,
  onClick,
}: {
  app: Workbook
  sheetCount: number
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onClick: () => void
}) {
  const updatedAt = app.updated_at ? new Date(app.updated_at) : null
  const timeSince = updatedAt ? formatTimeSince(updatedAt) : null

  return (
    <Card
      className="group relative flex h-full cursor-pointer flex-col p-4 shadow-premium transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-premium-hover"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-muted-foreground transition-colors duration-300 group-hover:bg-foreground group-hover:text-white">
            <AppIcon name={app.icon} className="h-4.5 w-4.5" />
          </div>
          <h3 className="font-semibold tracking-tight text-foreground">{app.label}</h3>
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-3 text-xs text-muted-foreground/80">
        <span>{sheetCount}개 {TERM.collection}</span>
        {timeSince && (
          <>
            <span className="h-0.5 w-0.5 rounded-full bg-current opacity-40" />
            <span>최근 {timeSince}</span>
          </>
        )}
      </div>

      {/* Context menu */}
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit() }}>
              <Edit2 className="mr-2 h-3.5 w-3.5" />
              이름 변경
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Card>
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
