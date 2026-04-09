import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import AppCard from '@/components/works/AppCard'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Collection } from '@/lib/types'

export default function AppListPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Collection[]>('/schema/collections')
      .then(setCollections)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">컬렉션</h1>
        <Link to="/apps/new">
          <Button>새 컬렉션 만들기</Button>
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">로딩 중...</p>
      ) : collections.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          컬렉션이 없습니다. 새 컬렉션을 만들어보세요.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <AppCard key={c.id} collection={c} />
          ))}
        </div>
      )}
    </div>
  )
}
