import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ApiError, api } from '@/lib/api'
import type { SafetyLevel } from '@/lib/types'

interface Migration {
  id: string
  collection_id: string
  operation: string
  ddl_up: string
  ddl_down: string
  safety_level: SafetyLevel
  created_at: string
  applied_at?: string
  applied_by?: string
  rolled_back_at?: string
}

const OP_LABELS: Record<string, string> = {
  create_collection: '컬렉션 생성',
  drop_collection: '컬렉션 삭제',
  add_field: '필드 추가',
  alter_field: '필드 변경',
  drop_field: '필드 삭제',
}

const SAFETY_COLORS: Record<SafetyLevel, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  SAFE: 'secondary',
  CAUTIOUS: 'outline',
  DANGEROUS: 'destructive',
}

export default function MigrationHistoryPage() {
  const [migrations, setMigrations] = useState<Migration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<Migration[]>('/schema/migrations/history')
      setMigrations(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '로딩 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleRollback(id: string) {
    if (!confirm('이 마이그레이션을 롤백하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
    setRollingBack(id)
    setError('')
    try {
      await api.post(`/schema/migrations/rollback/${id}`)
      await load()
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError('롤백 실패')
      }
    } finally {
      setRollingBack(null)
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">마이그레이션 이력</h1>

      {error && (
        <Card className="mb-4 border-destructive p-3 text-sm text-destructive">{error}</Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      ) : migrations.length === 0 ? (
        <p className="text-sm text-muted-foreground">이력이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {migrations.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{OP_LABELS[m.operation] || m.operation}</span>
                    <Badge variant={SAFETY_COLORS[m.safety_level]}>{m.safety_level}</Badge>
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
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {m.ddl_up}
                    </pre>
                  </details>
                </div>
                {!m.rolled_back_at && m.ddl_down && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRollback(m.id)}
                    disabled={rollingBack === m.id}
                  >
                    {rollingBack === m.id ? '롤백 중...' : '롤백'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
