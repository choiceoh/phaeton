import {
  Clipboard, FileText, Wrench, Calendar, BarChart3, CheckSquare,
  Users, ShoppingCart, Mail, Building2, FolderOpen, Briefcase,
  BookOpen, Globe, Heart, Star, Zap, Shield, Bell, Tag,
  Layers, Package, Truck, CreditCard, Settings, Database,
  MoreHorizontal, FolderInput,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useMoveCollection, useWorkbooks } from '@/hooks/useCollections'
import { useCurrentUser } from '@/hooks/useAuth'
import { TERM } from '@/lib/constants'
import type { Collection } from '@/lib/types'

export const APP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  clipboard: Clipboard,
  document: FileText,
  tool: Wrench,
  calendar: Calendar,
  chart: BarChart3,
  check: CheckSquare,
  users: Users,
  cart: ShoppingCart,
  mail: Mail,
  building: Building2,
  folder: FolderOpen,
  briefcase: Briefcase,
  book: BookOpen,
  globe: Globe,
  heart: Heart,
  star: Star,
  zap: Zap,
  shield: Shield,
  bell: Bell,
  tag: Tag,
  layers: Layers,
  package: Package,
  truck: Truck,
  card: CreditCard,
  settings: Settings,
  database: Database,
}

export const DEFAULT_ICON = 'clipboard'

export default function AppCard({ collection, count }: { collection: Collection, count?: number }) {
  const { data: user } = useCurrentUser()
  const canManage = user?.role === 'director' || user?.role === 'pm'
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)

  // How long ago the collection was last updated.
  const updatedAt = collection.updated_at ? new Date(collection.updated_at) : null
  const timeSince = updatedAt ? formatTimeSince(updatedAt) : null

  return (
    <>
      <Card className="group relative flex h-full flex-col p-4 shadow-premium transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-premium-hover">
        <Link to={`/apps/${collection.id}`} className="flex flex-1 flex-col">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-muted-foreground transition-colors duration-300 group-hover:bg-foreground group-hover:text-white">
                <AppIcon name={collection.icon} className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-semibold tracking-tight text-foreground">{collection.label}</h3>
            </div>
            <div className="flex items-center gap-1.5">
              {collection.is_system && <Badge variant="secondary">시스템</Badge>}
            </div>
          </div>
          <p className="mt-2.5 min-h-[2lh] flex-1 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">{collection.description || '\u00A0'}</p>
          <div className="mt-3.5 flex items-center gap-3 text-xs text-muted-foreground/80">
            <span>{collection.fields?.length || 0}개 {TERM.field}</span>
            {count != null && (
              <>
                <span className="h-0.5 w-0.5 rounded-full bg-current opacity-40" />
                <span>{count.toLocaleString('ko')}건 {TERM.record}</span>
              </>
            )}
            {timeSince && (
              <>
                <span className="h-0.5 w-0.5 rounded-full bg-current opacity-40" />
                <span>최근 {timeSince}</span>
              </>
            )}
          </div>
        </Link>

        {/* Context menu */}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
              onClick={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setMoveDialogOpen(true)}>
                <FolderInput className="mr-2 h-3.5 w-3.5" />
                워크북 이동
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </Card>

      {moveDialogOpen && (
        <MoveToWorkbookDialog
          collection={collection}
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
        />
      )}
    </>
  )
}

function MoveToWorkbookDialog({
  collection,
  open,
  onOpenChange,
}: {
  collection: Collection
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: workbooks } = useWorkbooks()
  const move = useMoveCollection()

  async function handleMove(workbookId: string | null) {
    await move.mutateAsync({ id: collection.id, workbookId })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>워크북 이동</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <strong>{collection.label}</strong> 시트를 이동할 워크북을 선택하세요.
        </p>
        <div className="flex flex-col gap-1">
          {workbooks?.map((wb) => (
            <button
              key={wb.id}
              onClick={() => handleMove(wb.id)}
              disabled={move.isPending}
              className={`rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                collection.workbook_id === wb.id ? 'bg-accent font-medium' : ''
              }`}
            >
              {wb.label}
              {collection.workbook_id === wb.id && (
                <span className="ml-2 text-xs text-muted-foreground">(현재)</span>
              )}
            </button>
          ))}
          <hr className="my-1" />
          <button
            onClick={() => handleMove(null)}
            disabled={move.isPending}
            className={`rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
              !collection.workbook_id ? 'bg-accent font-medium' : ''
            }`}
          >
            {TERM.uncategorized}
            {!collection.workbook_id && (
              <span className="ml-2 text-xs text-muted-foreground">(현재)</span>
            )}
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AppIcon({ name, className }: { name?: string, className?: string }) {
  const Icon = APP_ICONS[name || DEFAULT_ICON] || APP_ICONS[DEFAULT_ICON]
  return <Icon className={className} />
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
