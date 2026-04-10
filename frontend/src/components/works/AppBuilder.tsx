import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { useCollections, useCreateCollection } from '@/hooks/useCollections'
import type { AIBuildResult } from '@/hooks/useAI'
import { useAIGenerateSlug } from '@/hooks/useAI'
import { formatError } from '@/lib/api'
import type { CreateCollectionReq, FieldType } from '@/lib/types'

import AIBuildDialog from './AIBuildDialog'
import FieldPalette from './FieldPalette'
import FieldPreview, { type FieldDraft } from './FieldPreview'
import FieldProperties from './FieldProperties'

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
  const generateSlug = useAIGenerateSlug()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const selectedField = fields.find((f) => f.id === selectedId) || null

  const requestSlug = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      generateSlug.mutate(text, {
        onSuccess: (res) => {
          setSlug((prev) => {
            // Only update if user hasn't manually edited
            if (!slugManual) return res.slug
            return prev
          })
        },
      })
    }, 500)
  }, [slugManual, generateSlug])

  function handleLabelChange(value: string) {
    setLabel(value)
    if (!slugManual && value.trim()) {
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

  function handleAddField(fieldType: FieldType, presetOptions?: Record<string, unknown>) {
    const id = `field_${++fieldCounter.current}`
    const draft: FieldDraft = {
      id,
      slug: '',
      label: '새 필드',
      field_type: fieldType,
      is_required: false,
      is_unique: false,
      is_indexed: false,
      width: 6,
      height: 1,
      options: presetOptions,
    }
    setFields([...fields, draft])
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
      setError('slug과 label은 필수입니다.')
      return
    }
    for (const f of fields) {
      if (!f.slug) {
        setError(`필드 "${f.label}"의 slug이 비어 있습니다.`)
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
        toast.success(`${created.label} 컬렉션이 생성되었습니다`)
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
      <div className="flex justify-end">
        <AIBuildDialog onApply={handleAIApply} />
      </div>

      <div className="grid grid-cols-[1fr_1fr_2fr] gap-4">
        <div className="space-y-1">
          <Label>컬렉션 이름 (한글)</Label>
          <Input value={label} onChange={(e) => handleLabelChange(e.target.value)} placeholder="인허가 체크리스트" />
        </div>
        <div className="space-y-1">
          <Label>슬러그 (영문)</Label>
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
        <div className="space-y-1">
          <Label>설명</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="컬렉션 설명" />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto rounded-lg border p-3">
          <FieldPalette key={selectedId ? 'collapsed' : 'expanded'} onAdd={handleAddField} collapsed={!!selectedId} />
          {selectedField && (
            <>
              <div className="my-3 border-t" />
              <FieldProperties field={selectedField} collections={collections} siblingFields={fields} onChange={handleFieldChange} />
            </>
          )}
        </div>
        <div className="rounded-lg border p-3">
          <FieldPreview
            fields={fields}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={setFields}
            onRemove={handleRemoveField}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={createCollection.isPending || !label.trim() || !slug.trim()}
        >
          {createCollection.isPending ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
