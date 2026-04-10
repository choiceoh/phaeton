import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useCollectionCount } from '@/hooks/useEntries'
import { TERM } from '@/lib/constants'
import type { Collection } from '@/lib/types'

const ICONS: Record<string, string> = {
  clipboard: '📋',
  document: '📄',
  tool: '🔧',
  calendar: '📅',
  chart: '📊',
  check: '✅',
}

export default function AppCard({ collection }: { collection: Collection }) {
  const { data: count } = useCollectionCount(collection.slug)

  // How long ago the collection was last updated.
  const updatedAt = collection.updated_at ? new Date(collection.updated_at) : null
  const timeSince = updatedAt ? formatTimeSince(updatedAt) : null

  return (
    <Link to={`/apps/${collection.id}`}>
      <Card className="p-4 transition-colors hover:bg-accent">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{ICONS[collection.icon || ''] || '📋'}</span>
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
          {count !== undefined && (
            <span>{count.toLocaleString('ko')}건 {TERM.record}</span>
          )}
          {timeSince && <span>최근 {timeSince}</span>}
        </div>
      </Card>
    </Link>
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
