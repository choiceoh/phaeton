import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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
  return (
    <Link to={`/apps/${collection.id}`}>
      <Card className="p-4 transition-colors hover:bg-accent">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{ICONS[collection.icon || ''] || '📋'}</span>
            <h3 className="font-semibold">{collection.label}</h3>
          </div>
          {collection.is_system && <Badge variant="secondary">시스템</Badge>}
        </div>
        {collection.description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{collection.description}</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {collection.fields?.length || 0}개 필드 · /{collection.slug}
        </p>
      </Card>
    </Link>
  )
}
