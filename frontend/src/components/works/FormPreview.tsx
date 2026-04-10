import { FIELD_TYPE_LABELS, isLayoutType } from '@/lib/constants'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { FieldDraft } from './FieldPreview'

interface Props {
  fields: FieldDraft[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (fields: FieldDraft[]) => void
  onRemove: (id: string) => void
}

export default function FormPreview({ fields, selectedId, onSelect, onReorder, onRemove }: Props) {
  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.setData('text/plain', String(index))
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    const sourceIndex = Number(e.dataTransfer.getData('text/plain'))
    if (sourceIndex === targetIndex) return
    const updated = [...fields]
    const [moved] = updated.splice(sourceIndex, 1)
    updated.splice(targetIndex, 0, moved)
    onReorder(updated)
  }

  if (fields.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
        왼쪽에서 필드를 추가하세요
      </div>
    )
  }

  const smSpan: Record<number, string> = {
    1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3',
    4: 'sm:col-span-4', 5: 'sm:col-span-5', 6: 'sm:col-span-6',
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">입력화면 미리보기</h3>
      <div className="rounded-lg border bg-background p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          {fields.map((field, i) => {
            if (isLayoutType(field.field_type)) {
              return (
                <div
                  key={field.id}
                  className={`col-span-full cursor-pointer rounded-md px-1 py-0.5 transition-colors ${
                    selectedId === field.id ? 'ring-2 ring-primary ring-offset-2' : 'hover:bg-accent/30'
                  }`}
                  onClick={() => onSelect(field.id)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, i)}
                >
                  <LayoutPreview field={field} />
                </div>
              )
            }

            const span = field.width || 6
            return (
              <div
                key={field.id}
                className={`col-span-full ${smSpan[span] ?? 'sm:col-span-6'} cursor-pointer rounded-md p-2 transition-colors ${
                  selectedId === field.id ? 'ring-2 ring-primary ring-offset-2' : 'hover:bg-accent/30'
                }`}
                onClick={() => onSelect(field.id)}
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, i)}
              >
                <div className="flex items-center justify-between">
                  <Label className="pointer-events-none">
                    {field.label || '(제목 없음)'}
                    {field.is_required && <span className="ml-1 text-destructive">*</span>}
                  </Label>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(field.id) }}
                    className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive [div:hover>&]:opacity-100"
                    type="button"
                  >
                    ×
                  </button>
                </div>
                {field.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
                )}
                <div className="pointer-events-none mt-1">
                  <DraftFieldInput field={field} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LayoutPreview({ field }: { field: FieldDraft }) {
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

/** Read-only preview of a field input, matching EntryForm's FieldInput rendering. */
function DraftFieldInput({ field }: { field: FieldDraft }) {
  const h = field.height || 1

  switch (field.field_type) {
    case 'textarea':
      return (
        <Textarea
          readOnly
          tabIndex={-1}
          rows={(field.options?.rows as number) || Math.max(4, h * 2)}
          placeholder={field.label || '텍스트 입력'}
        />
      )
    case 'time':
      return <Input type="time" readOnly tabIndex={-1} />
    case 'text': {
      const textDisplay = field.options?.display_type as string | undefined
      if (h > 1) {
        return (
          <Textarea readOnly tabIndex={-1} rows={h * 2} placeholder={field.label || '텍스트 입력'} />
        )
      }
      const inputType = textDisplay === 'email' ? 'email'
        : textDisplay === 'url' ? 'url'
        : textDisplay === 'phone' ? 'tel'
        : 'text'
      return <Input type={inputType} readOnly tabIndex={-1} placeholder={field.label || '텍스트 입력'} />
    }
    case 'number':
    case 'integer': {
      const displayType = field.options?.display_type as string | undefined
      if (displayType === 'rating') {
        const max = (field.options?.max_rating as number) || 5
        return (
          <div className="flex items-center gap-1 pt-1">
            {Array.from({ length: max }, (_, i) => (
              <span key={i} className="text-lg text-muted-foreground/30">★</span>
            ))}
          </div>
        )
      }
      if (displayType === 'progress') {
        return (
          <div className="space-y-1">
            <Input type="number" readOnly tabIndex={-1} placeholder="0" />
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-0 rounded-full bg-primary" />
            </div>
          </div>
        )
      }
      const prefix = displayType === 'currency'
        ? (field.options?.currency_code as string) === 'USD' ? '$' : '₩'
        : undefined
      const suffix = displayType === 'percent' ? '%' : undefined
      return (
        <div className="relative">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {prefix}
            </span>
          )}
          <Input
            type="number"
            readOnly
            tabIndex={-1}
            placeholder="0"
            className={prefix ? 'pl-8' : suffix ? 'pr-8' : ''}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      )
    }
    case 'date':
      return <Input readOnly tabIndex={-1} placeholder="날짜 선택" />
    case 'datetime':
      return <Input type="datetime-local" readOnly tabIndex={-1} />
    case 'boolean':
      return (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox disabled />
        </div>
      )
    case 'select': {
      const choices = (field.options?.choices as string[]) || []
      const display = field.options?.display as string | undefined
      if (display === 'radio') {
        return (
          <div className="space-y-1">
            {choices.length > 0 ? choices.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="radio" disabled />
                {c}
              </label>
            )) : (
              <span className="text-xs text-muted-foreground">선택지를 추가하세요</span>
            )}
          </div>
        )
      }
      return (
        <Select disabled>
          <SelectTrigger>
            <SelectValue placeholder="항목 선택" />
          </SelectTrigger>
        </Select>
      )
    }
    case 'multiselect': {
      const choices = (field.options?.choices as string[]) || []
      return (
        <div className="space-y-1">
          {choices.length > 0 ? choices.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <Checkbox disabled />
              {c}
            </label>
          )) : (
            <span className="text-xs text-muted-foreground">선택지를 추가하세요</span>
          )}
        </div>
      )
    }
    case 'relation':
      return <Input readOnly tabIndex={-1} placeholder="관계 항목 선택" className="bg-muted/50" />
    case 'user':
      return <Input readOnly tabIndex={-1} placeholder="사용자 선택" className="bg-muted/50" />
    case 'autonumber':
      return <Input readOnly tabIndex={-1} value="(자동 생성)" className="bg-muted" />
    case 'formula':
    case 'lookup':
    case 'rollup':
      return (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          ({FIELD_TYPE_LABELS[field.field_type]}) 자동 계산
        </div>
      )
    case 'file':
      return <Input type="file" disabled tabIndex={-1} />
    case 'json':
      return <Textarea readOnly tabIndex={-1} rows={Math.max(4, h * 2)} placeholder="{ }" />
    default:
      return <Input readOnly tabIndex={-1} placeholder={field.label || '입력'} />
  }
}
