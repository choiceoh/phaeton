import { useState } from 'react'
import { toast } from 'sonner'

import RelationCombobox from '@/components/common/RelationCombobox'
import UserCombobox from '@/components/common/UserCombobox'
import { useCurrentUser } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
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
import { isLayoutType } from '@/lib/constants'
import type { Field, Process } from '@/lib/types'

interface Props {
  fields: Field[]
  initialData?: Record<string, unknown>
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
  submitting?: boolean
  process?: Process
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
  process,
}: Props) {
  const [data, setData] = useState<Record<string, unknown>>(initialData ?? {})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { data: currentUser } = useCurrentUser()

  function setValue(name: string, value: unknown) {
    setData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => { const next = { ...prev }; delete next[name]; return next })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    for (const field of fields) {
      if (!field.is_required || isLayoutType(field.field_type)) continue
      const val = data[field.slug]
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        newErrors[field.slug] = '필수 항목입니다'
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    onSubmit(data)
  }

  // Process status transitions (only when editing an existing entry).
  // Filter by the current user's role when allowed_roles is specified.
  const currentStatus = initialData?._status as string | undefined
  const availableTransitions = (() => {
    if (!process?.is_enabled || !currentStatus || !initialData?.id || !process.statuses?.length) return []
    const statusByName = new Map(process.statuses.map((s) => [s.name, s]))
    const currentStatusObj = statusByName.get(currentStatus)
    if (!currentStatusObj) return []
    const userRole = currentUser?.role
    return process.transitions
      .filter((t) => {
        if (t.from_status_id !== currentStatusObj.id) return false
        if (t.allowed_roles.length > 0 && (!userRole || !t.allowed_roles.includes(userRole))) return false
        return true
      })
      .map((t) => {
        const target = process.statuses.find((s) => s.id === t.to_status_id)
        return { label: t.label, targetName: target?.name ?? '', targetColor: target?.color ?? '#6b7280' }
      })
  })()

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Status transition UI */}
      {process?.is_enabled && currentStatus && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">현재 상태:</span>
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
              style={{
                backgroundColor:
                  process.statuses.find((s) => s.name === currentStatus)?.color ?? '#6b7280',
              }}
            >
              {currentStatus}
            </span>
          </div>
          {availableTransitions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {availableTransitions.map((t, i) => (
                <Button
                  key={i}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue('_status', t.targetName)}
                >
                  {t.label} → {t.targetName}
                </Button>
              ))}
            </div>
          )}
          {typeof data._status === 'string' && data._status !== currentStatus && (
            <p className="mt-2 text-xs text-muted-foreground">
              저장 시 상태가 <strong>{String(data._status)}</strong>(으)로 변경됩니다.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        {fields.map((field) => {
          if (isLayoutType(field.field_type)) {
            return (
              <div key={field.id} className="col-span-full">
                <LayoutElement field={field} />
              </div>
            )
          }
          // Formula fields: show computed value as read-only.
          if (field.field_type === 'formula') {
            const span = field.width || 6
            const smSpan: Record<number, string> = {
              1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3',
              4: 'sm:col-span-4', 5: 'sm:col-span-5', 6: 'sm:col-span-6',
            }
            const val = data[field.slug]
            return (
              <div key={field.id} className={`col-span-full ${smSpan[span] ?? 'sm:col-span-6'}`}>
                <Label className="text-muted-foreground">{field.label} (수식)</Label>
                <div className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">
                  {val != null ? String(val) : '-'}
                </div>
              </div>
            )
          }
          const span = field.width || 6
          const smSpan: Record<number, string> = {
            1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3',
            4: 'sm:col-span-4', 5: 'sm:col-span-5', 6: 'sm:col-span-6',
          }
          return (
            <div
              key={field.id}
              className={`col-span-full ${smSpan[span] ?? 'sm:col-span-6'}`}
            >
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
                {errors[field.slug] && (
                  <p className="mt-1 text-xs text-destructive">{errors[field.slug]}</p>
                )}
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
  if (field.field_type === 'user' && typeof value === 'object') {
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
  const h = field.height || 1

  switch (field.field_type) {
    case 'textarea':
      return (
        <Textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={(field.options?.rows as number) || Math.max(4, h * 2)}
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
    case 'text': {
      const textDisplay = field.options?.display_type as string | undefined
      if (h > 1) {
        return (
          <Textarea
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.is_required}
            rows={h * 2}
          />
        )
      }
      const inputType = textDisplay === 'email' ? 'email'
        : textDisplay === 'url' ? 'url'
        : textDisplay === 'phone' ? 'tel'
        : 'text'
      return (
        <Input
          type={inputType}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.is_required}
        />
      )
    }
    case 'number':
    case 'integer': {
      const displayType = field.options?.display_type as string | undefined
      if (displayType === 'rating') {
        const max = (field.options?.max_rating as number) || 5
        const current = (value as number) || 0
        return (
          <div className="flex items-center gap-1 pt-1">
            {Array.from({ length: max }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`text-lg ${i < current ? 'text-yellow-500' : 'text-muted-foreground/30'}`}
                onClick={() => onChange(i + 1 === current ? 0 : i + 1)}
              >
                ★
              </button>
            ))}
          </div>
        )
      }
      if (displayType === 'progress') {
        const num = (value as number) ?? 0
        return (
          <div className="space-y-1">
            <Input
              type="number"
              min={0}
              max={100}
              value={value === null || value === undefined ? '' : num}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
              required={field.is_required}
            />
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.max(0, num))}%` }}
              />
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
            value={value === null || value === undefined ? '' : (value as number)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            required={field.is_required}
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
      return (
        <DatePicker
          value={(value as string)?.slice(0, 10) || undefined}
          onChange={(v) => onChange(v ?? null)}
          placeholder="날짜 선택"
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
            <SelectValue placeholder="항목 선택" />
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
    case 'autonumber':
      return (
        <Input
          value={value != null ? String(value) : '(자동 생성)'}
          disabled
          className="bg-muted"
        />
      )
    case 'formula':
    case 'lookup':
    case 'rollup':
      return (
        <Input
          value={value != null ? String(value) : '(자동 계산)'}
          disabled
          className="bg-muted"
        />
      )
    case 'user':
      return <UserCombobox value={value as string | undefined} onChange={onChange} />
    case 'file':
      return <FileInput value={value as string | undefined} onChange={onChange} />
    case 'table':
      return <TableAreaInput field={field} value={value} onChange={onChange} />
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
          rows={Math.max(4, h * 2)}
        />
      )
    default:
      return (
        <Input value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />
      )
  }
}

// -- TableAreaInput: inline repeating table within the form --

interface SubColumn {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  choices?: string[]
}

function TableAreaInput({
  field,
  value,
  onChange,
}: {
  field: Field
  value: unknown
  onChange: (v: unknown) => void
}) {
  const subColumns: SubColumn[] = (field.options?.sub_columns as SubColumn[]) || [
    { key: 'col1', label: '항목', type: 'text' },
    { key: 'col2', label: '값', type: 'text' },
  ]
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : []

  function updateRow(rowIdx: number, key: string, val: unknown) {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [key]: val } : r))
    onChange(next)
  }

  function addRow() {
    const empty: Record<string, unknown> = {}
    for (const col of subColumns) {
      empty[col.key] = col.type === 'number' ? null : ''
    }
    onChange([...rows, empty])
  }

  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground w-8">#</th>
              {subColumns.map((col) => (
                <th key={col.key} className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
                  {col.label}
                </th>
              ))}
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b last:border-b-0">
                <td className="px-2 py-1 text-xs text-muted-foreground">{rowIdx + 1}</td>
                {subColumns.map((col) => (
                  <td key={col.key} className="px-1 py-0.5">
                    {col.type === 'select' ? (
                      <select
                        className="h-7 w-full rounded border border-input bg-transparent px-1 text-sm"
                        value={(row[col.key] as string) || ''}
                        onChange={(e) => updateRow(rowIdx, col.key, e.target.value)}
                      >
                        <option value="">선택</option>
                        {(col.choices || []).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={col.type === 'number' ? 'number' : 'text'}
                        className="h-7 text-sm"
                        value={row[col.key] != null ? String(row[col.key]) : ''}
                        onChange={(e) =>
                          updateRow(
                            rowIdx,
                            col.key,
                            col.type === 'number'
                              ? e.target.value === '' ? null : Number(e.target.value)
                              : e.target.value,
                          )
                        }
                      />
                    )}
                  </td>
                ))}
                <td className="px-1 py-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(rowIdx)}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={subColumns.length + 2} className="px-2 py-3 text-center text-xs text-muted-foreground">
                  행을 추가하세요
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        + 행 추가
      </Button>
    </div>
  )
}

function FileInput({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (v: unknown) => void
}) {
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await api.upload(file)
      onChange(result.url)
    } catch {
      toast.error('파일 업로드에 실패했습니다')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1">
      <Input type="file" onChange={handleFile} disabled={uploading} />
      {uploading && <p className="text-xs text-muted-foreground">업로드 중...</p>}
      {value && !uploading && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline"
        >
          {value.split('/').pop()}
        </a>
      )}
    </div>
  )
}
