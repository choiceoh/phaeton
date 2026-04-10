import {
  Clipboard, FileText, Wrench, Calendar, BarChart3, CheckSquare,
  Users, ShoppingCart, Mail, Building2, FolderOpen, Briefcase,
  BookOpen, Globe, Heart, Star, Zap, Shield, Bell, Tag,
  Layers, Package, Truck, CreditCard, Settings, Database,
} from 'lucide-react'
import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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

  // How long ago the collection was last updated.
  const updatedAt = collection.updated_at ? new Date(collection.updated_at) : null
  const timeSince = updatedAt ? formatTimeSince(updatedAt) : null

  return (
    <Link to={`/apps/${collection.id}`}>
      <Card className="p-4 transition-all duration-200 hover:bg-accent hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <AppIcon name={collection.icon} className="h-4 w-4" />
            </div>
            <h3 className="font-semibold">{collection.label}</h3>
          </div>
          <div className="flex items-center gap-1.5">
            {collection.is_system && <Badge variant="secondary">시스템</Badge>}
          </div>
        </div>
        {collection.description && (
          <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">{collection.description}</p>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{collection.fields?.length || 0}개 {TERM.field}</span>
          {count != null && (
            <span>{count.toLocaleString('ko')}건 {TERM.record}</span>
          )}
          {timeSince && <span>최근 {timeSince}</span>}
        </div>
      </Card>
    </Link>
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
