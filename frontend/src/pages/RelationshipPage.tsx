import { GitBranch } from 'lucide-react'
import { Link } from 'react-router'

import EmptyState from '@/components/common/EmptyState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import RelationshipGraph from '@/components/works/RelationshipGraph'
import { useRelationshipGraph } from '@/hooks/useRelationshipGraph'

export default function RelationshipPage() {
  const { nodes, edges, isLoading } = useRelationshipGraph()

  return (
    <div>
      <PageHeader
        title="시트 관계도"
        description="시트 간 참조 필드 연결을 시각적으로 확인합니다"
        breadcrumb={[
          { label: '앱 목록', href: '/apps' },
          { label: '시트 관계도' },
        ]}
      />

      {isLoading && <LoadingState />}

      {!isLoading && edges.length === 0 && (
        <EmptyState
          icon={<GitBranch className="h-10 w-10" />}
          title="참조 관계가 없습니다"
          description="시트에 참조 필드를 추가하면 여기에 시트 간 관계가 표시됩니다."
          action={
            <Link to="/apps" className="text-primary underline text-sm">
              앱 목록으로 돌아가기
            </Link>
          }
        />
      )}

      {!isLoading && edges.length > 0 && (
        <div className="rounded-lg border bg-card" style={{ height: 'calc(100vh - 220px)', minHeight: 500 }}>
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm text-muted-foreground">
              {nodes.length}개 시트, {edges.length}개 참조
            </span>
            <span className="text-xs text-muted-foreground">
              노드를 드래그하여 이동, 더블클릭으로 시트 열기
            </span>
          </div>
          <RelationshipGraph nodes={nodes} edges={edges} />
        </div>
      )}
    </div>
  )
}
