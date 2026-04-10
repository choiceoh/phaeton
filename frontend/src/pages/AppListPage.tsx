import { Layers, MousePointerClick, Settings } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import AppCard from '@/components/works/AppCard'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import RoleGate from '@/components/common/RoleGate'
import TemplateGallery from '@/components/works/TemplateGallery'
import { Button } from '@/components/ui/button'
import { useCollections } from '@/hooks/useCollections'
import { TERM } from '@/lib/constants'

export default function AppListPage() {
  const { data: collections, isLoading, isError, error, refetch } = useCollections()
  const [showTemplates, setShowTemplates] = useState(false)

  return (
    <div>
      <PageHeader
        title={TERM.collections}
        description="업무 앱을 만들고 데이터를 관리하세요"
        actions={
          <RoleGate roles={['director', 'pm']}>
            <Button
              variant="outline"
              onClick={() => setShowTemplates(!showTemplates)}
            >
              템플릿
            </Button>
            <Link to="/apps/new">
              <Button>{TERM.newCollection}</Button>
            </Link>
          </RoleGate>
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

      {isLoading && <LoadingState />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {collections && collections.length === 0 && !showTemplates && (
        <div className="mx-auto max-w-lg mt-8 animate-fade-in-up">
          <EmptyState
            title={TERM.noCollections}
            description={TERM.noCollectionsDesc}
            icon="📋"
            action={
              <RoleGate roles={['director', 'pm']}>
                <Link to="/apps/new">
                  <Button>{TERM.newCollection}</Button>
                </Link>
              </RoleGate>
            }
          />
          {/* Onboarding guide */}
          <div className="mt-8 space-y-4">
            <h3 className="text-center text-sm font-medium text-muted-foreground">
              시작하기
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <OnboardingStep
                icon={<Layers className="h-5 w-5" />}
                step="1"
                title="업무 정의"
                description="관리할 업무를 만들고 필요한 항목을 설정하세요."
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

      {collections && collections.length > 0 && (
        <div className="grid justify-center gap-4 grid-cols-[repeat(auto-fill,minmax(280px,340px))]">
          {collections.map((c, i) => (
            <div key={c.id} className={`animate-scale-in stagger-${Math.min(i + 1, 12)}`}>
              <AppCard collection={c} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
    <div className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="text-xs text-muted-foreground">STEP {step}</div>
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
