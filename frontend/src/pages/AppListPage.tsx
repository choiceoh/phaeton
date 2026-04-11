import {
  ChevronDown, ChevronRight, ChevronUp, Edit2, GitBranch,
  Layers, MoreHorizontal, MousePointerClick, Plus, Search,
  Settings, Sparkles, Trash2,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'

import AppCard from '@/components/works/AppCard'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import TemplateGallery from '@/components/works/TemplateGallery'
import { Button } from '@/components/ui/button'
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
  useCollectionCounts,
  useWorkbooks,
  useCreateWorkbook,
  useUpdateWorkbook,
  useDeleteWorkbook,
} from '@/hooks/useCollections'
import { useCurrentUser } from '@/hooks/useAuth'
import { TERM } from '@/lib/constants'
import type { Collection, Workbook } from '@/lib/types'

// -- Collapsed state persistence --
const COLLAPSED_KEY = 'workbook-collapsed'

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
  const { data: collections, isLoading, isError, error, refetch } = useCollections()
  const { data: counts } = useCollectionCounts()
  const { data: workbooks } = useWorkbooks()
  const { data: user } = useCurrentUser()
  const aiAvailable = useAIAvailable()
  const canManage = user?.role === 'director' || user?.role === 'pm'

  const [showTemplates, setShowTemplates] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  // Workbook dialog state
  const [wbDialogOpen, setWbDialogOpen] = useState(false)
  const [wbEditId, setWbEditId] = useState<string | null>(null)
  const [wbLabel, setWbLabel] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const createWb = useCreateWorkbook()
  const updateWb = useUpdateWorkbook()
  const deleteWb = useDeleteWorkbook()

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveCollapsed(next)
      return next
    })
  }, [])

  // -- Filtering --
  const filtered = useMemo(() => {
    if (!collections) return []
    if (!search.trim()) return collections
    const q = search.trim().toLowerCase()
    return collections.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q)),
    )
  }, [collections, search])

  // -- Group by workbook --
  const { grouped, uncategorized, sortedWorkbooks } = useMemo(() => {
    const map = new Map<string, Collection[]>()
    const uncat: Collection[] = []
    for (const c of filtered) {
      if (c.workbook_id) {
        const arr = map.get(c.workbook_id) ?? []
        arr.push(c)
        map.set(c.workbook_id, arr)
      } else {
        uncat.push(c)
      }
    }
    const sorted = (workbooks ?? []).slice().sort((a, b) =>
      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.label.localeCompare(b.label),
    )
    return { grouped: map, uncategorized: uncat, sortedWorkbooks: sorted }
  }, [filtered, workbooks])

  const isSearching = search.trim().length > 0
  const hasCollections = collections && collections.length > 0

  // -- Workbook dialog handlers --
  function openCreateWb() {
    setWbEditId(null)
    setWbLabel('')
    setWbDialogOpen(true)
  }
  function openEditWb(wb: Workbook) {
    setWbEditId(wb.id)
    setWbLabel(wb.label)
    setWbDialogOpen(true)
  }
  async function handleWbSave() {
    if (!wbLabel.trim()) return
    if (wbEditId) {
      await updateWb.mutateAsync({ id: wbEditId, label: wbLabel.trim() })
    } else {
      await createWb.mutateAsync({ label: wbLabel.trim() })
    }
    setWbDialogOpen(false)
  }
  async function handleWbDelete() {
    if (!deleteConfirm) return
    await deleteWb.mutateAsync(deleteConfirm)
    setDeleteConfirm(null)
  }

  return (
    <div>
      <PageHeader
        title={TERM.collections}
        description="시트를 만들고 데이터를 관리하세요"
        actions={
          <>
            <Link to="/apps/relationships">
              <Button variant="outline" className="gap-1">
                <GitBranch className="h-4 w-4" />
                관계도
              </Button>
            </Link>
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
            {canManage && (
              <Button variant="outline" onClick={openCreateWb} className="gap-1">
                <Plus className="h-4 w-4" />
                {TERM.newWorkbook}
              </Button>
            )}
            <Link to="/apps/new">
              <Button>{TERM.newCollection}</Button>
            </Link>
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

      {collections && collections.length === 0 && !showTemplates && (
        <div className="mx-auto max-w-lg mt-8 animate-fade-in-up">
          <EmptyState
            title={TERM.noCollections}
            description={TERM.noCollectionsDesc}
            icon={<Layers className="h-10 w-10" />}
            action={
              <Link to="/apps/new">
                <Button>{TERM.newCollection}</Button>
              </Link>
            }
          />
          {/* AI quick start */}
          {aiAvailable && (
            <div className="mt-6 flex items-center gap-4 rounded-lg border p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium">AI로 첫 시트 만들기</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  어떤 데이터를 관리하고 싶은지 설명하면 AI가 시트 구조를 제안합니다
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
          {/* Onboarding guide */}
          <div className="mt-8 space-y-4">
            <h3 className="text-center text-sm font-medium text-muted-foreground">
              시작하기
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <OnboardingStep
                icon={<Layers className="h-5 w-5" />}
                step="1"
                title="시트 정의"
                description="관리할 시트를 만들고 필요한 항목을 설정하세요."
              />
              <OnboardingStep
                icon={<MousePointerClick className="h-5 w-5" />}
                step="2"
                title="데이터 입력"
                description="폼으로 데이터를 등록하거나 CSV로 일괄 가져오세요."
              />
              <OnboardingStep
                icon={<Settings className="h-5 w-5" />}
                step="3"
                title="보기 구성"
                description="목록, 보드, 캘린더, 갤러리 등 원하는 형태로 데이터를 확인하세요."
              />
            </div>
          </div>
        </div>
      )}

      {hasCollections && (
        <>
          {/* Search bar */}
          <div className="relative mb-5 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="시트 검색…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              '{search}'에 해당하는 시트가 없습니다
            </p>
          ) : (
            <div className="space-y-6">
              {/* Workbook sections */}
              {sortedWorkbooks.map((wb) => {
                const sheets = grouped.get(wb.id)
                if (!sheets || sheets.length === 0) {
                  // Show empty workbooks only when not searching
                  if (isSearching) return null
                }
                const isOpen = isSearching || !collapsed.has(wb.id)
                const sheetCount = sheets?.length ?? 0

                return (
                  <WorkbookSection
                    key={wb.id}
                    workbook={wb}
                    sheets={sheets ?? []}
                    sheetCount={sheetCount}
                    isOpen={isOpen}
                    onToggle={() => toggleCollapse(wb.id)}
                    counts={counts}
                    canManage={canManage}
                    onEdit={() => openEditWb(wb)}
                    onDelete={() => setDeleteConfirm(wb.id)}
                  />
                )
              })}

              {/* Uncategorized section */}
              {uncategorized.length > 0 && (
                <div>
                  {sortedWorkbooks.length > 0 && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-medium">{TERM.uncategorized}</span>
                      <span className="text-xs">({uncategorized.length})</span>
                    </div>
                  )}
                  <SheetGrid sheets={uncategorized} counts={counts} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Workbook create/edit dialog */}
      <Dialog open={wbDialogOpen} onOpenChange={setWbDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{wbEditId ? '워크북 수정' : '새 워크북'}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="워크북 이름"
            value={wbLabel}
            onChange={(e) => setWbLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleWbSave()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setWbDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleWbSave}
              disabled={!wbLabel.trim() || createWb.isPending || updateWb.isPending}
            >
              {createWb.isPending || updateWb.isPending ? '처리 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="워크북 삭제"
        description="워크북을 삭제하면 소속 시트들은 미분류로 이동합니다."
        confirmLabel="삭제"
        variant="destructive"
        onConfirm={handleWbDelete}
        loading={deleteWb.isPending}
      />
    </div>
  )
}

// -- Workbook Section --
function WorkbookSection({
  workbook,
  sheets,
  sheetCount,
  isOpen,
  onToggle,
  counts,
  canManage,
  onEdit,
  onDelete,
}: {
  workbook: Workbook
  sheets: Collection[]
  sheetCount: number
  isOpen: boolean
  onToggle: () => void
  counts?: Record<string, number>
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
        >
          {isOpen
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          {workbook.label}
          <span className="text-xs font-normal text-muted-foreground">({sheetCount})</span>
        </button>

        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="mr-2 h-3.5 w-3.5" />
                이름 변경
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isOpen && (
        sheets.length > 0 ? (
          <SheetGrid sheets={sheets} counts={counts} />
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            아직 시트가 없습니다
          </p>
        )
      )}
    </div>
  )
}

// -- Sheet Grid --
function SheetGrid({ sheets, counts }: { sheets: Collection[]; counts?: Record<string, number> }) {
  return (
    <div className="grid justify-center gap-4 grid-cols-[repeat(auto-fill,minmax(280px,340px))]">
      {sheets.map((c, i) => (
        <div key={c.id} className={`animate-scale-in stagger-${Math.min(i + 1, 12)}`}>
          <AppCard collection={c} count={counts?.[c.slug]} />
        </div>
      ))}
    </div>
  )
}

// -- Onboarding Step --
function OnboardingStep({
  icon,
  step,
  title,
  description,
}: {
  icon: React.ReactNode
  step: string
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-white p-6 text-center shadow-premium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-premium-hover">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-muted-foreground">
        {icon}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">STEP {step}</div>
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}
