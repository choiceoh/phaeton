import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAIBuildCollection, type AIBuildResult } from '@/hooks/useAI'
import { FIELD_TYPE_LABELS } from '@/lib/constants'
import type { FieldType } from '@/lib/types'

interface Props {
  onApply: (result: AIBuildResult) => void
}

export default function AIBuildDialog({ onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [result, setResult] = useState<AIBuildResult | null>(null)

  const buildMutation = useAIBuildCollection()

  function handleGenerate() {
    if (!description.trim()) return
    setResult(null)
    buildMutation.mutate(description, {
      onSuccess: (data) => setResult(data),
    })
  }

  function handleApply() {
    if (!result) return
    onApply(result)
    setOpen(false)
    setDescription('')
    setResult(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setDescription('')
      setResult(null)
      buildMutation.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium ring-offset-background hover:bg-accent hover:text-accent-foreground"
      >
        <Sparkles className="h-4 w-4" />
        AI로 만들기
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI 컬렉션 빌더</DialogTitle>
          <DialogDescription>
            어떤 업무를 관리하고 싶은지 설명해 주세요. AI가 적절한 컬렉션 구조를 제안합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="예: 프로젝트별 인허가 체크리스트를 관리하고 싶습니다. 각 항목에 담당자, 마감일, 진행상태, 첨부파일이 필요합니다."
            rows={4}
            disabled={buildMutation.isPending}
          />

          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={!description.trim() || buildMutation.isPending}
            >
              {buildMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  생성하기
                </>
              )}
            </Button>
          </div>

          {buildMutation.isError && (
            <p className="text-sm text-destructive">
              {buildMutation.error?.message ?? 'AI 요청에 실패했습니다'}
            </p>
          )}

          {result && (
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <h4 className="text-sm font-semibold">{result.label}</h4>
                <p className="text-xs text-muted-foreground">{result.slug}</p>
                {result.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{result.description}</p>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  필드 {result.fields.length}개
                </p>
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {result.fields.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                    >
                      <span>
                        {f.label}
                        <span className="ml-1.5 text-xs text-muted-foreground">({f.slug})</span>
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {FIELD_TYPE_LABELS[f.field_type as FieldType] ?? f.field_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {result && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setResult(null)}>
              다시 생성
            </Button>
            <Button onClick={handleApply}>적용하기</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
