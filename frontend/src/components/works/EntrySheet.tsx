import { useState } from 'react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
}: Props) {
  const recordId = initialData?.id ? String(initialData.id) : undefined
  const isEdit = !!recordId
  const [tab, setTab] = useState<string>('form')
  const [commentBody, setCommentBody] = useState('')

  const { data: currentUser } = useCurrentUser()

  const { data: historyData } = useRecordHistory(
    isEdit ? slug : undefined,
    recordId,
  )

  const { data: commentsData } = useComments(
    isEdit ? slug : undefined,
    recordId,
  )

  const createComment = useCreateComment(slug ?? '', recordId ?? '')
  const deleteComment = useDeleteComment(slug ?? '', recordId ?? '')

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setTab('form') } }}>
      <SheetContent className="w-full overflow-y-auto sm:w-[480px] sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title || '새 항목'}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {isEdit ? (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="form">편집</TabsTrigger>
                <TabsTrigger value="comments">댓글</TabsTrigger>
                <TabsTrigger value="history">이력</TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="mt-4">
                <EntryForm
                  fields={fields}
                  initialData={initialData}
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
                  {commentsData?.data?.length ? (
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
                                onClick={() => deleteComment.mutate(c.id)}
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
                    <p className="text-sm text-muted-foreground">댓글이 없습니다.</p>
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
              </TabsContent>
              <TabsContent value="history" className="mt-4">
                {historyData?.data?.length ? (
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
                                <span className="font-medium">{key}</span>:{' '}
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
                  <p className="text-sm text-muted-foreground">변경 이력이 없습니다.</p>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <EntryForm
              fields={fields}
              initialData={initialData}
              onSubmit={(data) => {
                onSubmit(data)
                onClose()
              }}
              onCancel={onClose}
              submitting={submitting}
              process={process}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function formatValue(v: unknown): string {
  if (v == null) return '-'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
