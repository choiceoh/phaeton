import { useCallback, useEffect, useRef, useState } from 'react'

import { FIELD_TYPE_LABELS, isLayoutType } from '@/lib/constants'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { FieldType } from '@/lib/types'

import type { FieldDraft } from './FieldPreview'

interface Props {
  fields: FieldDraft[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (fields: FieldDraft[]) => void
  onRemove: (id: string) => void
  onAdd: (fieldType: FieldType, presetOptions?: Record<string, unknown>, index?: number) => void
  onFieldChange: (updated: FieldDraft) => void
}

/** Group fields into logical rows based on their widths (6-col grid). */
function computeRows(fields: FieldDraft[]): { fieldId: string, rowIndex: number }[] {
  const result: { fieldId: string, rowIndex: number }[] = []
  let row = 0
  let used = 0
  for (const f of fields) {
    const w = isLayoutType(f.field_type) ? 6 : (f.width || 6)
    if (used + w > 6) {
      row++
      used = 0
    }
    result.push({ fieldId: f.id, rowIndex: row })
    used += w
    if (used >= 6) {
      row++
      used = 0
    }
  }
  return result
}

export default function FormPreview({ fields, selectedId, onSelect, onReorder, onRemove, onAdd, onFieldChange }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ fieldId: string, startX: number, startWidth: number } | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number | null>(null)
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null)
  const [shrinkRow, setShrinkRow] = useState<number | null>(null)
  const [draggedWidth, setDraggedWidth] = useState<number>(3)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // Compute rows and shrink map for the currently hovered row
  const rowMap = computeRows(fields)
  const shrinkWidths = new Map<string, number>()
  if (shrinkRow !== null) {
    const rowFields = rowMap.filter((r) => r.rowIndex === shrinkRow)
    const origFields = rowFields.map((r) => fields.find((f) => f.id === r.fieldId)!)
    const totalOrigWidth = origFields.reduce((sum, f) => sum + (f.width || 6), 0)
    if (totalOrigWidth >= 6) {
      // Row is full — shrink to make room for the incoming field
      const available = 6 - Math.min(draggedWidth, 3) // incoming takes at most 3 cols
      for (const f of origFields) {
        const ratio = (f.width || 6) / totalOrigWidth
        const newW = Math.max(1, Math.round(available * ratio))
        shrinkWidths.set(f.id, newW)
      }
      // Adjust rounding errors
      const assigned = Array.from(shrinkWidths.values()).reduce((a, b) => a + b, 0)
      if (assigned !== available && origFields.length > 0) {
        const lastId = origFields[origFields.length - 1].id
        shrinkWidths.set(lastId, shrinkWidths.get(lastId)! + (available - assigned))
      }
    }
  }

  const handleResizeStart = useCallback((e: React.MouseEvent, field: FieldDraft) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { fieldId: field.id, startX: e.clientX, startWidth: field.width || 6 }
    setResizingId(field.id)
    setPreviewWidth(field.width || 6)
  }, [])

  useEffect(() => {
    if (!resizingId) return

    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current || !gridRef.current) return
      const gridRect = gridRef.current.getBoundingClientRect()
      const colWidth = gridRect.width / 6
      const deltaX = e.clientX - resizeRef.current.startX
      const deltaCols = Math.round(deltaX / colWidth)
      const newWidth = Math.max(1, Math.min(6, resizeRef.current.startWidth + deltaCols))
      setPreviewWidth(newWidth)
    }

    function onMouseUp() {
      if (resizeRef.current && previewWidth !== null) {
        const field = fields.find((f) => f.id === resizeRef.current!.fieldId)
        if (field && previewWidth !== field.width) {
          onFieldChange({ ...field, width: previewWidth })
        }
      }
      resizeRef.current = null
      setResizingId(null)
      setPreviewWidth(null)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [resizingId, previewWidth, fields, onFieldChange])

  function handleDragStart(e: React.DragEvent, index: number) {
    if (resizingId) { e.preventDefault(); return }
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.setData('source/reorder', 'true')
    setDraggedWidth(fields[index]?.width || 6)
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-accent/40')
    setShrinkRow(null)
    setDropIndex(null)

    const paletteData = e.dataTransfer.getData('application/palette-field')
    if (paletteData) {
      const { type, presetOptions } = JSON.parse(paletteData)
      onAdd(type, presetOptions, targetIndex)
      return
    }

    const isReorder = e.dataTransfer.getData('source/reorder')
    if (isReorder) {
      const sourceIndex = Number(e.dataTransfer.getData('text/plain'))
      if (sourceIndex === targetIndex) return
      const updated = [...fields]
      const [moved] = updated.splice(sourceIndex, 1)
      updated.splice(targetIndex, 0, moved)
      onReorder(updated)
    }
  }

  function handleDropEnd(e: React.DragEvent) {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-accent/40')
    setShrinkRow(null)
    setDropIndex(null)

    const paletteData = e.dataTransfer.getData('application/palette-field')
    if (paletteData) {
      const { type, presetOptions } = JSON.parse(paletteData)
      onAdd(type, presetOptions)
    }
  }

  function handleFieldDragOver(e: React.DragEvent, fieldId: string, index: number) {
    e.preventDefault()
    e.currentTarget.classList.add('bg-accent/40')
    const entry = rowMap.find((r) => r.fieldId === fieldId)
    if (entry) {
      setShrinkRow(entry.rowIndex)
    }
    setDropIndex(index)
  }

  function handleFieldDragLeave(e: React.DragEvent) {
    e.currentTarget.classList.remove('bg-accent/40')
    setDropIndex(null)
  }

  function handleGridDragLeave(e: React.DragEvent) {
    // Clear shrink and dropIndex when leaving the grid entirely
    if (gridRef.current && !gridRef.current.contains(e.relatedTarget as Node)) {
      setShrinkRow(null)
      setDropIndex(null)
    }
  }

  if (fields.length === 0) {
    return (
      <div
        className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground transition-colors"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-accent/40') }}
        onDragLeave={(e) => { e.currentTarget.classList.remove('bg-accent/40') }}
        onDrop={handleDropEnd}
      >
        왼쪽에서 항목을 드래그하거나 클릭하여 추가하세요
      </div>
    )
  }

  const smSpan: Record<number, string> = {
    1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3',
    4: 'sm:col-span-4', 5: 'sm:col-span-5', 6: 'sm:col-span-6',
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-foreground/70">입력화면 미리보기</h3>
      <div className="rounded-lg border bg-muted/50 p-4">
        <div ref={gridRef} className="grid grid-cols-1 gap-4 sm:grid-cols-6" onDragLeave={handleGridDragLeave}>
          {fields.map((field, i) => {
            if (isLayoutType(field.field_type)) {
              return (
                <div key={field.id} className="col-span-full">
                  {dropIndex === i && (
                    <div className="col-span-full -mb-2 h-0.5 rounded bg-primary transition-all" />
                  )}
                  <div
                    className={`cursor-pointer rounded-md px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      selectedId === field.id ? 'ring-2 ring-primary ring-offset-2' : 'hover:bg-accent/30'
                    }`}
                    tabIndex={0}
                    onClick={() => onSelect(field.id)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragOver={(e) => handleFieldDragOver(e, field.id, i)}
                    onDragLeave={handleFieldDragLeave}
                    onDrop={(e) => handleDrop(e, i)}
                  >
                    <LayoutPreview field={field} />
                  </div>
                </div>
              )
            }

            const shrunk = shrinkWidths.get(field.id)
            const span = resizingId === field.id && previewWidth !== null
              ? previewWidth
              : shrunk !== undefined ? shrunk : (field.width || 6)
            return (
              <div key={field.id} className={`col-span-full ${smSpan[span] ?? 'sm:col-span-6'}`}>
                {dropIndex === i && (
                  <div className="col-span-full -mb-2 h-0.5 rounded bg-primary transition-all" />
                )}
                <div
                  className={`relative cursor-pointer rounded-md p-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    selectedId === field.id ? 'ring-2 ring-primary ring-offset-2' : 'hover:bg-accent/30'
                  } ${resizingId === field.id ? 'ring-2 ring-primary/50' : ''}`}
                  tabIndex={0}
                  onClick={() => onSelect(field.id)}
                  draggable={!resizingId}
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleFieldDragOver(e, field.id, i)}
                  onDragLeave={handleFieldDragLeave}
                  onDrop={(e) => handleDrop(e, i)}
                >
                <div className="flex items-center justify-between">
                  <Label className="pointer-events-none">
                    {field.label || '(제목 없음)'}
                    {field.is_required && <span className="ml-1 text-destructive">*</span>}
                  </Label>
                  <div className="flex items-center gap-1">
                    {(selectedId === field.id || resizingId === field.id) && (
                      <span className="text-[10px] text-muted-foreground">{span}/6</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setRemoveTargetId(field.id) }}
                      className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive [div:hover>&]:opacity-100"
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {field.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
                )}
                <div className="pointer-events-none mt-1">
                  <DraftFieldInput field={field} />
                </div>
                {/* Resize handle */}
                <div
                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize rounded-r-md opacity-0 transition-opacity hover:bg-primary/20 hover:opacity-100 [div:hover>&]:opacity-100"
                  onMouseDown={(e) => handleResizeStart(e, field)}
                />
                </div>
              </div>
            )
          })}
          {dropIndex === fields.length && (
            <div className="col-span-full h-0.5 rounded bg-primary transition-all" />
          )}
          <div
            className="col-span-full flex h-10 items-center justify-center rounded-md border-2 border-dashed border-transparent text-xs text-muted-foreground transition-colors"
            onDragOver={(e) => {
              e.preventDefault()
              setShrinkRow(null)
              setDropIndex(fields.length)
              e.currentTarget.classList.add('border-muted-foreground/30', 'bg-accent/40')
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove('border-muted-foreground/30', 'bg-accent/40')
              setDropIndex(null)
            }}
            onDrop={handleDropEnd}
          >
            여기에 드래그하여 추가
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!removeTargetId}
        onOpenChange={(open) => !open && setRemoveTargetId(null)}
        title="항목을 제거하시겠습니까?"
        description="이 항목이 입력화면에서 제거됩니다."
        variant="destructive"
        confirmLabel="제거"
        onConfirm={() => {
          if (removeTargetId) onRemove(removeTargetId)
          setRemoveTargetId(null)
        }}
      />
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
    case 'spreadsheet': {
      const cols = (field.options?.sub_columns as { key: string; label: string }[]) || [
        { key: 'col1', label: 'A' },
        { key: 'col2', label: 'B' },
        { key: 'col3', label: 'C' },
      ]
      const rowCount = Math.min((field.options?.initial_rows as number) || 5, 4)
      return (
        <div className="rounded-md border overflow-hidden text-xs">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/70">
                <th className="w-8 border-r border-b px-1 py-0.5 text-center text-[10px] text-muted-foreground" />
                {cols.map((c, i) => (
                  <th key={c.key} className="border-r border-b px-2 py-0.5 text-center text-[10px] font-medium text-muted-foreground min-w-[60px]">
                    <span className="text-muted-foreground/50 mr-0.5">{String.fromCharCode(65 + i)}</span>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, ri) => (
                <tr key={ri}>
                  <td className="border-r border-b px-1 py-0.5 text-center text-[10px] text-muted-foreground bg-muted/30">
                    {ri + 1}
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="border-r border-b px-1 py-0.5 h-6" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'file':
      return <Input type="file" disabled tabIndex={-1} />
    case 'json':
      return <Textarea readOnly tabIndex={-1} rows={Math.max(4, h * 2)} placeholder="{ }" />
    default:
      return <Input readOnly tabIndex={-1} placeholder={field.label || '입력'} />
  }
}
