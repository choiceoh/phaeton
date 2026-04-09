import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { Collection, CreateCollectionReq, FieldType } from '@/lib/types'

import FieldPalette from './FieldPalette'
import FieldPreview, { type FieldDraft } from './FieldPreview'
import FieldProperties from './FieldProperties'

let fieldCounter = 0

export default function AppBuilder() {
  const navigate = useNavigate()
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<FieldDraft[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Collection[]>('/schema/collections').then(setCollections).catch(() => {})
  }, [])

  const selectedField = fields.find((f) => f.id === selectedId) || null

  function handleAddField(fieldType: FieldType) {
    const id = `field_${++fieldCounter}`
    const draft: FieldDraft = {
      id,
      slug: '',
      label: '새 필드',
      field_type: fieldType,
      is_required: false,
      is_unique: false,
      is_indexed: false,
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

  async function handleSave() {
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

    setSaving(true)
    try {
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
          options: f.options,
          relation: f.relation,
        })),
      }
      const created = await api.post<Collection>('/schema/collections', body)
      navigate(`/apps/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
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
        <Button onClick={handleSave} disabled={saving || !label.trim() || !slug.trim()}>
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
