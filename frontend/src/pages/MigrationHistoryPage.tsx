import { useState } from 'react'
import { toast } from 'sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useMigrationHistory, useRollbackMigration } from '@/hooks/useMigrations'
import { formatError } from '@/lib/api'
import type { SafetyLevel } from '@/lib/types'

const OP_LABELS: Record<string, string> = {
  create_collection: '컬렉션 생성',
  drop_collection: '컬렉션 삭제',
  add_field: '필드 추가',
  alter_field: '필드 변경',
  drop_field: '필드 삭제',
}

const SAFETY_VARIANT: Record<SafetyLevel, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  SAFE: 'secondary',
  CAUTIOUS: 'outline',
  DANGEROUS: 'destructive',
}

export default function MigrationHistoryPage() {
  const { data: migrations, isLoading, isError, error, refetch } = useMigrationHistory()
  const rollback = useRollbackMigration()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function handleRollback() {
    if (!confirmId) return
    rollback.mutate(confirmId, {
      onSuccess: () => {
        toast.success('롤백되었습니다')
        setConfirmId(null)
      },
      onError: (err) => toast.error(formatError(err)),
    })
  }

  return (
    <div>
      <PageHeader title="마이그레이션 이력" description="모든 스키마 변경 기록" />

      {isLoading && <LoadingState />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}

      {migrations && migrations.length === 0 && (
        <EmptyState title="이력이 없습니다" />
      )}

      {migrations && migrations.length > 0 && (
        <div className="space-y-3">
          {migrations.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{OP_LABELS[m.operation] || m.operation}</span>
                    <Badge variant={SAFETY_VARIANT[m.safety_level]}>{m.safety_level}</Badge>
                    {m.rolled_back_at && (
                      <Badge variant="outline" className="text-muted-foreground">
                        롤백됨
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleString('ko')}
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      DDL 보기
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                      {m.ddl_up}
                    </pre>
                  </details>
                </div>
                {!m.rolled_back_at && m.ddl_down && (
                  <Button variant="outline" size="sm" onClick={() => setConfirmId(m.id)}>
                    롤백
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="이 마이그레이션을 롤백하시겠습니까?"
        description="ddl_down을 실행해 이전 상태로 되돌립니다. 데이터 손실이 발생할 수 있습니다."
        variant="destructive"
        confirmLabel="롤백"
        onConfirm={handleRollback}
        loading={rollback.isPending}
      />
    </div>
  )
}
