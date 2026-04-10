import { Copy, History, Loader2, MessageSquare, Printer } from 'lucide-react'
import { useRef, useState } from 'react'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAIAvailable } from '@/contexts/AIAvailabilityContext'
import { useAIPrefill } from '@/hooks/useAI'
import { useRecordHistory } from '@/hooks/useHistory'
import { useComments, useCreateComment, useDeleteComment } from '@/hooks/useComments'
import { useCurrentUser } from '@/hooks/useAuth'
import type { Field, Process } from '@/lib/types'

import EntryForm from './EntryForm'

interface Props {
  open: boolean
  onClose: () => void
  fields: Field[]
  slug?: string
  initialData?: Record<string, unknown>
  onSubmit: (data: Record<string, unknown>) => void
  submitting?: boolean
  title?: string
  process?: Process
  onDuplicate?: (data: Record<string, unknown>) => void
}

const OP_LABELS: Record<string, string> = {
  create: '생성',
  update: '수정',
  delete: '삭제',
}

export default function EntrySheet({
  open,
  onClose,
  fields,
  slug,
  initialData,
  onSubmit,
  submitting,
  title,
  process,
  onDuplicate,
}: Props) {
  const recordId = initialData?.id ? String(initialData.id) : undefined
  const isEdit = !!recordId
  const [tab, setTab] = useState<string>('form')
  const [commentBody, setCommentBody] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [aiPrompt, setAiPrompt] = useState('')
  const [prefillData, setPrefillData] = useState<Record<string, unknown> | null>(null)
  const aiAvailable = useAIAvailable()
  const prefill = useAIPrefill(slug)
  const formKeyRef = useRef(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const { data: currentUser } = useCurrentUser()

  const { data: historyData, isLoading: historyLoading } = useRecordHistory(
    isEdit ? slug : undefined,
    recordId,
  )

  const { data: commentsData, isLoading: commentsLoading } = useComments(
    isEdit ? slug : undefined,
    recordId,
  )

  const createComment = useCreateComment(slug ?? '', recordId ?? '')
  const deleteComment = useDeleteComment(slug ?? '', recordId ?? '')

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setTab('form') } }}>
      <SheetContent ref={contentRef} className="w-[calc(100vw-1rem)] overflow-y-auto sm:w-[640px] sm:max-w-2xl">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>{title || '새 항목'}</SheetTitle>
            {isEdit && (
              <div className="flex items-center gap-1" data-print-hide>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => window.print()}
                >
                  <Printer className="h-3.5 w-3.5" />
                  인쇄
                </Button>
                {onDuplicate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => {
                      const { id, _version, created_at, updated_at, _created_by, _optimistic, _updated_at, _created_at, ...rest } = initialData as Record<string, unknown>
                      onDuplicate(rest)
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    복제
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>
        <div className="mt-4">
          {isEdit ? (
            <Tabs value={tab} onValueChange={(v) => { setTab(v); contentRef.current?.scrollTo(0, 0) }}>
              <TabsList data-print-hide>
                <TabsTrigger value="form">편집</TabsTrigger>
                <TabsTrigger value="comments">댓글</TabsTrigger>
                <TabsTrigger value="history">이력</TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="mt-4">
                <EntryForm
                  fields={fields}
                  initialData={initialData}
                  slug={slug}
                  onSubmit={(data) => {
                    onSubmit(data)
                    onClose()
                  }}
                  onCancel={onClose}
                  submitting={submitting}
                  process={process}
                />
              </TabsContent>
              <TabsContent value="comments" className="mt-4">
                <div className="space-y-3">
                  {commentsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))
                  ) : commentsData?.data?.length ? (
                    commentsData.data.map((c) => (
                      <div key={c.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.user_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {new Date(c.created_at).toLocaleString('ko')}
                            </span>
                            {(currentUser?.id === c.user_id || currentUser?.role === 'director') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setDeleteTargetId(c.id)}
                              >
                                삭제
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      compact
                      icon={<MessageSquare className="h-8 w-8" />}
                      title="아직 댓글이 없습니다"
                      description="댓글을 남겨 팀원들과 소통하세요."
                    />
                  )}
                  <div className="space-y-2">
                    <Textarea
                      placeholder="댓글을 입력하세요..."
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      rows={3}
                    />
                    <Button
                      size="sm"
                      disabled={!commentBody.trim() || createComment.isPending}
                      onClick={() => {
                        createComment.mutate(commentBody.trim(), {
                          onSuccess: () => setCommentBody(''),
                        })
                      }}
                    >
                      댓글 작성
                    </Button>
                  </div>
                </div>
                <ConfirmDialog
                  open={deleteTargetId !== null}
                  onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}
                  title="댓글을 삭제하시겠습니까?"
                  description="삭제된 댓글은 복구할 수 없습니다."
                  variant="destructive"
                  confirmLabel="삭제"
                  loading={deleteComment.isPending}
                  onConfirm={() => {
                    if (deleteTargetId !== null) {
                      deleteComment.mutate(deleteTargetId, {
                        onSuccess: () => setDeleteTargetId(null),
                      })
                    }
                  }}
                />
              </TabsContent>
              <TabsContent value="history" className="mt-4">
                {historyLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-12 rounded-full" />
                            <Skeleton className="h-4 w-16" />
                          </div>
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : historyData?.data?.length ? (
                  <div className="space-y-3">
                    {historyData.data.map((change) => (
                      <div key={change.id} className="rounded-md border p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{OP_LABELS[change.operation] ?? change.operation}</Badge>
                            <span className="font-medium">{change.user_name || '시스템'}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(change.created_at).toLocaleString('ko')}
                          </span>
                        </div>
                        {change.operation === 'update' && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(change.diff).map(([key, val]) => (
                              <div key={key} className="text-xs">
                                <span className="font-medium">{fieldLabel(fields, key)}</span>:{' '}
                                <span className="text-muted-foreground">{formatValue(val.old)}</span>
                                {' → '}
                                <span>{formatValue(val.new)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<History className="h-8 w-8" />}
                    title="변경 이력이 없습니다"
                    description="데이터가 수정되면 이력이 기록됩니다."
                  />
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <>
              {aiAvailable && slug && (
                <div className="mb-3 flex gap-1">
                  <Input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiPrompt.trim() && !prefill.isPending) {
                        prefill.mutate(aiPrompt.trim(), {
                          onSuccess: (res) => {
                            setPrefillData({ ...initialData, ...res })
                            formKeyRef.current++
                            setAiPrompt('')
                          },
                        })
                      }
                    }}
                    placeholder="한 줄로 입력하세요..."
                    className="h-8 text-sm"
                    disabled={prefill.isPending}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={!aiPrompt.trim() || prefill.isPending}
                    onClick={() => {
                      prefill.mutate(aiPrompt.trim(), {
                        onSuccess: (res) => {
                          setPrefillData({ ...initialData, ...res })
                          formKeyRef.current++
                          setAiPrompt('')
                        },
                      })
                    }}
                  >
                    {prefill.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '채우기'}
                  </Button>
                </div>
              )}
              <EntryForm
                key={formKeyRef.current}
                fields={fields}
                initialData={prefillData ?? initialData}
                slug={slug}
                onSubmit={(data) => {
                  onSubmit(data)
                  onClose()
                  setPrefillData(null)
                }}
                onCancel={() => {
                  onClose()
                  setPrefillData(null)
                }}
                submitting={submitting}
                process={process}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function fieldLabel(fields: Field[], key: string): string {
  const field = fields.find((f) => f.slug === key)
  return field?.label ?? key
}

function formatValue(v: unknown): string {
  if (v == null) return '-'
  if (Array.isArray(v)) {
    if (v.length === 0) return '-'
    return v.map((item) => formatSingleValue(item)).join(', ')
  }
  return formatSingleValue(v)
}

function formatSingleValue(v: unknown): string {
  if (v == null) return '-'
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if ('display_value' in obj && obj.display_value != null) return String(obj.display_value)
    if ('name' in obj && obj.name != null) return String(obj.name)
    if ('label' in obj && obj.label != null) return String(obj.label)
    if ('title' in obj && obj.title != null) return String(obj.title)
    return JSON.stringify(v)
  }
  return String(v)
}
