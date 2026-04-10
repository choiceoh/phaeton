import { useState } from 'react'

import RelationCombobox from '@/components/common/RelationCombobox'
import UserCombobox from '@/components/common/UserCombobox'
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
import { isLayoutType } from '@/lib/constants'
import type { Field } from '@/lib/types'

interface Props {
  fields: Field[]
  initialData?: Record<string, unknown>
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
  submitting?: boolean
}

// EntryForm renders a dynamic form built from a collection's fields.
// State is held in plain useState because the form shape is decided at
// runtime — react-hook-form's typed Path<T> assumes a static schema.
//
// Validation is done server-side: required fields are still marked with *
// and submitted, but the actual error display comes from the API response
// (toast in the parent).
export default function EntryForm({
  fields,
  initialData,
  onSubmit,
  onCancel,
  submitting,
}: Props) {
  const [data, setData] = useState<Record<string, unknown>>(initialData ?? {})

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
        {fields.map((field) => {
          // Layout fields render without the Label wrapper.
          if (isLayoutType(field.field_type)) {
            return (
              <div key={field.id}>
                <LayoutElement field={field} />
              </div>
            )
          }

          return (
            <div key={field.id}>
              <Label>
                {field.label}
                {field.is_required && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <div className="mt-1">
                <FieldInput
                  field={field}
                  value={extractValue(data[field.slug], field)}
                  onChange={(v) => setValue(field.slug, v)}
                />
              </div>
            </div>
          )
        })}
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

// extractValue normalises a value coming from the server. Relation fields
// can arrive either as a UUID string (no expand) or as a nested object
// (with expand). The form always works with the UUID.
function extractValue(value: unknown, field: Field): unknown {
  if (value == null) return value
  if (field.field_type === 'relation' && typeof value === 'object') {
    return (value as Record<string, unknown>).id
  }
  return value
}

function LayoutElement({ field }: { field: Field }) {
  switch (field.field_type) {
    case 'label':
      return (
        <p className="text-sm text-muted-foreground">
          {(field.options?.content as string) || field.label}
        </p>
      )
    case 'line':
      return <hr className="my-2" />
    case 'spacer':
      return <div style={{ height: (field.options?.height as number) || 24 }} />
    default:
      return null
  }
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
    case 'textarea':
      return (
        <Textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={(field.options?.rows as number) || 4}
          required={field.is_required}
        />
      )
    case 'number':
    case 'integer':
      return (
        <Input
          type="number"
          value={value === null || value === undefined ? '' : (value as number)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          required={field.is_required}
        />
      )
    case 'date':
      return (
        <Input
          type="date"
          value={(value as string)?.slice(0, 10) || ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        />
      )
    case 'datetime':
      return (
        <Input
          type="datetime-local"
          value={(value as string)?.slice(0, 16) || ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        />
      )
    case 'time':
      return (
        <Input
          type="time"
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
      const display = field.options?.display as string | undefined

      if (display === 'radio') {
        return (
          <div className="space-y-1">
            {choices.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={field.slug}
                  value={c}
                  checked={value === c}
                  onChange={() => onChange(c)}
                />
                {c}
              </label>
            ))}
          </div>
        )
      }

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
                  if (checked) onChange([...selected, c])
                  else onChange(selected.filter((x) => x !== c))
                }}
              />
              {c}
            </label>
          ))}
        </div>
      )
    }
    case 'relation':
      if (!field.relation?.target_collection_id) {
        return <Input disabled value="(관계 대상 미설정)" />
      }
      return (
        <RelationCombobox
          targetCollectionId={field.relation.target_collection_id}
          value={value as string | undefined}
          onChange={onChange}
        />
      )
    case 'user':
      return <UserCombobox value={value as string | undefined} onChange={onChange} />
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
