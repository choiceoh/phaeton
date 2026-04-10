import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCollections, useCreateCollection } from '@/hooks/useCollections'
import { formatError } from '@/lib/api'
import type { CreateCollectionReq, FieldType } from '@/lib/types'

import FieldPalette from './FieldPalette'
import FieldPreview, { type FieldDraft } from './FieldPreview'
import FieldProperties from './FieldProperties'

export default function AppBuilder() {
  const navigate = useNavigate()
  const fieldCounter = useRef(0)
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { data: collections = [] } = useCollections()
  const createCollection = useCreateCollection()

  const selectedField = fields.find((f) => f.id === selectedId) || null

  function handleAddField(fieldType: FieldType) {
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>컬렉션 이름 (한글)</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="인허가 체크리스트" />
        </div>
        <div className="space-y-1">
          <Label>슬러그 (영문)</Label>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="permit_checklist"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>설명</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-[180px_1fr_280px] gap-4">
        <div className="rounded-lg border p-3">
          <FieldPalette onAdd={handleAddField} />
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
        <div className="rounded-lg border p-3">
          <FieldProperties field={selectedField} collections={collections} onChange={handleFieldChange} />
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
