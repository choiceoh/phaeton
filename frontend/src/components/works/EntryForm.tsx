import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { Field, ListEnvelope } from '@/lib/types'

interface Props {
  fields: Field[]
  initialData?: Record<string, unknown>
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
  submitting?: boolean
}

export default function EntryForm({ fields, initialData, onSubmit, onCancel, submitting }: Props) {
  const [data, setData] = useState<Record<string, unknown>>(initialData || {})

  function setValue(name: string, value: unknown) {
    setData((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.id}>
            <Label>
              {field.label}
              {field.is_required && <span className="ml-1 text-destructive">*</span>}
            </Label>
            <div className="mt-1">
              <FieldInput
                field={field}
                value={data[field.slug]}
                onChange={(v) => setValue(field.slug, v)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field
  value: unknown
  onChange: (v: unknown) => void
}) {
  switch (field.field_type) {
    case 'text':
      return (
        <Input
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        />
      )
    case 'number':
    case 'integer':
      return (
        <Input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          required={field.is_required}
        />
      )
    case 'date':
      return (
        <Input
          type="date"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        />
      )
    case 'datetime':
      return (
        <Input
          type="datetime-local"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        />
      )
    case 'boolean':
      return (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox checked={!!value} onCheckedChange={(c) => onChange(!!c)} />
        </div>
      )
    case 'select': {
      const choices = (field.options?.choices as string[]) || []
      return (
        <Select value={(value as string) || ''} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="선택" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case 'multiselect': {
      const choices = (field.options?.choices as string[]) || []
      const selected = (value as string[]) || []
      return (
        <div className="space-y-1">
          {choices.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(c)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...selected, c])
                  } else {
                    onChange(selected.filter((x) => x !== c))
                  }
                }}
              />
              {c}
            </label>
          ))}
        </div>
      )
    }
    case 'relation':
      return <RelationInput field={field} value={value} onChange={onChange} />
    case 'file':
      return <Input type="file" onChange={(e) => onChange(e.target.files?.[0]?.name)} />
    case 'json':
      return (
        <Textarea
          value={typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value))
            } catch {
              onChange(e.target.value)
            }
          }}
          rows={4}
        />
      )
    default:
      return (
        <Input value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />
      )
  }
}

function RelationInput({
  field,
  value,
  onChange,
}: {
  field: Field
  value: unknown
  onChange: (v: unknown) => void
}) {
  const [items, setItems] = useState<Array<{ id: string; label: string }>>([])

  useEffect(() => {
    if (!field.relation) return
    // Fetch target collection records by id.
    // We need the target collection's slug to call /api/data/{slug}.
    // Since we don't have it here, we fetch the collection meta first.
    api
      .get<{ slug: string }>(`/schema/collections/${field.relation.target_collection_id}`)
      .then((col) =>
        api.getRaw<ListEnvelope<Record<string, unknown>>>(
          `/data/${col.slug}?limit=100`,
        ),
      )
      .then((res) => {
        const data = res.data || []
        setItems(
          data.map((r) => ({
            id: String(r.id),
            label: String(r.title || r.name || r.label || r.id),
          })),
        )
      })
      .catch(() => setItems([]))
  }, [field.relation])

  return (
    <Select value={(value as string) || ''} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="선택" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
