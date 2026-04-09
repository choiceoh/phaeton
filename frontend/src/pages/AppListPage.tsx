import { Link } from 'react-router'

import AppCard from '@/components/works/AppCard'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import RoleGate from '@/components/common/RoleGate'
import { Button } from '@/components/ui/button'
import { useCollections } from '@/hooks/useCollections'

export default function AppListPage() {
  const { data: collections, isLoading, isError, error, refetch } = useCollections()

  return (
    <div>
      <PageHeader
        title="컬렉션"
        description="사용자 정의 데이터 테이블 목록"
        actions={
          <RoleGate roles={['director', 'pm']}>
            <Link to="/apps/new">
              <Button>새 컬렉션 만들기</Button>
            </Link>
          </RoleGate>
        }
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {collections && collections.length === 0 && (
        <EmptyState
          title="컬렉션이 없습니다"
          description="새 컬렉션을 만들어 데이터 테이블을 정의하세요."
          icon="📋"
          action={
            <RoleGate roles={['director', 'pm']}>
              <Link to="/apps/new">
                <Button>새 컬렉션 만들기</Button>
              </Link>
            </RoleGate>
          }
        />
      )}

      {collections && collections.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <AppCard key={c.id} collection={c} />
          ))}
        </div>
      )}
    </div>
  )
}
