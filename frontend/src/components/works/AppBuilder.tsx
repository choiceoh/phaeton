import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { useCollections, useCreateCollection } from '@/hooks/useCollections'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { useAIAvailable } from '@/contexts/AIAvailabilityContext'
import type { AIBuildResult } from '@/hooks/useAI'
import { useAIGenerateSlug } from '@/hooks/useAI'
import { formatError } from '@/lib/api'
import type { CreateCollectionReq, FieldType } from '@/lib/types'

import CoachMark from '@/components/common/CoachMark'

import AIBuildDialog from './AIBuildDialog'
import FieldPalette from './FieldPalette'
import { type FieldDraft } from './FieldPreview'
import FieldProperties from './FieldProperties'
import FormPreview from './FormPreview'

const BUILDER_COACH_STEPS = [
  {
    title: '항목 팔레트',
    description: '여기서 원하는 항목을 드래그하거나 클릭하여 입력화면에 추가하세요.',
    target: '[data-coach="palette"]',
  },
  {
    title: '입력화면 미리보기',
    description: '추가한 항목들이 실제 입력화면에 어떻게 보이는지 확인할 수 있습니다.',
    target: '[data-coach="preview"]',
  },
  {
    title: '항목 속성',
    description: '항목을 선택하면 여기서 이름, 필수 여부, 옵션 등을 설정할 수 있습니다.',
    target: '[data-coach="properties"]',
  },
]

export default function AppBuilder() {
  const navigate = useNavigate()
  const fieldCounter = useRef(0)
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { data: collections = [] } = useCollections()
  const createCollection = useCreateCollection()
  const aiAvailable = useAIAvailable()
  const generateSlug = useAIGenerateSlug()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const slugManualRef = useRef(false)

  useEffect(() => {
    slugManualRef.current = slugManual
  }, [slugManual])

  const selectedField = fields.find((f) => f.id === selectedId) || null

  const isDirty = useMemo(
    () => label.trim() !== '' || slug.trim() !== '' || description.trim() !== '' || fields.length > 0,
    [label, slug, description, fields],
  )

  const blocker = useUnsavedChanges(isDirty)

  const requestSlug = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (slugManualRef.current) return
      generateSlug.mutate(text, {
        onSuccess: (res) => {
          // Re-check after async response in case user typed in slug field meanwhile.
          if (slugManualRef.current) return
          setSlug(res.slug)
        },
      })
    }, 500)
  }, [generateSlug])

  function handleLabelChange(value: string) {
    setLabel(value)
    if (!slugManual && value.trim() && aiAvailable) {
      requestSlug(value.trim())
    }
    if (!slugManual && !value.trim()) {
      setSlug('')
    }
  }

  function handleSlugChange(value: string) {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setSlug(sanitized)
    if (sanitized) setSlugManual(true)
    else setSlugManual(false)
  }

  function handleAIApply(result: AIBuildResult) {
    setSlug(result.slug)
    setSlugManual(false)
    setLabel(result.label)
    setDescription(result.description || '')
    const drafts: FieldDraft[] = result.fields.map((f) => ({
      id: `ai_${++fieldCounter.current}`,
      slug: f.slug,
      label: f.label,
      field_type: f.field_type as FieldType,
      is_required: f.is_required,
      is_unique: false,
      is_indexed: false,
      width: f.width || 6,
      height: f.height || 1,
      options: f.options,
    }))
    setFields(drafts)
    setSelectedId(null)
  }

  function handleAddField(fieldType: FieldType, presetOptions?: Record<string, unknown>, index?: number) {
    const id = `field_${++fieldCounter.current}`
    const draft: FieldDraft = {
      id,
      slug: '',
      label: '새 항목',
      field_type: fieldType,
      is_required: false,
      is_unique: false,
      is_indexed: false,
      width: 3,
      height: 1,
      options: presetOptions,
    }
    if (index !== undefined) {
      const updated = [...fields]
      updated.splice(index, 0, draft)
      setFields(updated)
    } else {
      setFields([...fields, draft])
    }
    setSelectedId(id)
  }

  function handleFieldChange(updated: FieldDraft) {
    setFields(fields.map((f) => (f.id === updated.id ? updated : f)))
  }

  function handleRemoveField(id: string) {
    setFields(fields.filter((f) => f.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function handleSave() {
    setError('')
    if (!slug.trim() || !label.trim()) {
      setError('영문 ID와 이름은 필수입니다.')
      return
    }
    for (const f of fields) {
      if (!f.slug) {
        setError(`항목 "${f.label}"의 영문 ID가 비어 있습니다.`)
        return
      }
    }

    const body: CreateCollectionReq = {
      slug,
      label,
      description: description || undefined,
      fields: fields.map((f) => ({
        slug: f.slug,
        label: f.label,
        field_type: f.field_type,
        is_required: f.is_required,
        is_unique: f.is_unique,
        is_indexed: f.is_indexed,
        default_value: f.default_value,
        width: f.width,
        height: f.height,
        options: f.options,
        relation: f.relation,
      })),
    }

    createCollection.mutate(body, {
      onSuccess: (created) => {
        toast.success(`${created.label} 업무가 생성되었습니다`)
        navigate(`/apps/${created.id}`)
      },
      onError: (err) => {
        const msg = formatError(err)
        setError(msg)
        toast.error(msg)
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">새 업무 만들기</h1>
        <AIBuildDialog onApply={handleAIApply} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
        <div data-coach="palette" className="max-h-[calc(100vh-160px)] overflow-y-auto rounded-lg border p-3">
          <FieldPalette onAdd={handleAddField} />
          {selectedField && (
            <div data-coach="properties">
              <div className="my-3 border-t" />
              <FieldProperties field={selectedField} collections={collections} siblingFields={fields} onChange={handleFieldChange} />
            </div>
          )}
        </div>
        <div data-coach="preview" className="rounded-lg border p-3 space-y-4">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">기본 정보</p>
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-2 space-y-1">
                <Label>업무 이름 (한글)</Label>
                <Input value={label} onChange={(e) => handleLabelChange(e.target.value)} placeholder="인허가 체크리스트" />
              </div>
              <div className="col-span-1 space-y-1">
                <Label>영문 ID</Label>
                <div className="relative">
                  <Input
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="자동 생성됨"
                  />
                  {generateSlug.isPending && (
                    <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="col-span-3 space-y-1">
                <Label>설명</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="업무 설명" />
              </div>
            </div>
          </div>
          <FormPreview
            fields={fields}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={setFields}
            onRemove={handleRemoveField}
            onAdd={handleAddField}
            onFieldChange={handleFieldChange}
          />
        </div>
      </div>

      <div className="flex justify-end pb-16">
        <Button
          onClick={handleSave}
          disabled={createCollection.isPending || !label.trim() || !slug.trim()}
        >
          {createCollection.isPending ? '저장 중...' : '저장'}
        </Button>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => { if (!open) blocker.reset?.() }}
        title="저장하지 않고 나가시겠습니까?"
        description="작성 중인 내용이 저장되지 않습니다."
        confirmLabel="나가기"
        cancelLabel="계속 작성"
        onConfirm={() => blocker.proceed?.()}
      />

      <CoachMark storageKey="phaeton:coach:builder" steps={BUILDER_COACH_STEPS} />
    </div>
  )
}
