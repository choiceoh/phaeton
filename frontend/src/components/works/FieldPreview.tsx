import { useState } from 'react'

import { FIELD_TYPE_LABELS, isLayoutType } from '@/lib/constants'
import type { FieldType } from '@/lib/types'

import ConfirmDialog from '@/components/common/ConfirmDialog'

export interface FieldDraft {
  id: string // client-local id
  slug: string
  label: string
  field_type: FieldType
  is_required: boolean
  is_unique: boolean
  is_indexed: boolean
  default_value?: string
  description?: string
  width: number
  height: number
  options?: Record<string, unknown>
  relation?: {
    target_collection_id: string
    relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many'
    on_delete: string
  }
}

interface Props {
  fields: FieldDraft[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (fields: FieldDraft[]) => void
  onRemove: (id: string) => void
}

export default function FieldPreview({ fields, selectedId, onSelect, onReorder, onRemove }: Props) {
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null)

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
        왼쪽에서 항목을 추가하세요
      </div>
    )
  }

  const colSpanClass: Record<number, string> = {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    6: 'col-span-6',
  }

  const rowSpanClass: Record<number, string> = {
    1: '',
    2: 'row-span-2 min-h-24',
    3: 'row-span-3 min-h-36',
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">항목 목록</h3>
      <div className="grid grid-cols-6 gap-2">
        {fields.map((field, i) => (
          <div
            key={field.id}
            className={`${colSpanClass[field.width] ?? 'col-span-6'} ${rowSpanClass[field.height] ?? ''} cursor-pointer rounded-md border p-3 transition-colors ${
              selectedId === field.id ? 'border-primary bg-accent' : 'hover:bg-accent/50'
            } ${isLayoutType(field.field_type) ? 'border-dashed opacity-75' : ''
            }`}
            onClick={() => onSelect(field.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, i)}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1">
                <span className="truncate text-sm font-medium">{field.label || '(제목 없음)'}</span>
                {field.is_required && <span className="shrink-0 text-xs text-destructive">*</span>}
                {field.is_unique && <span className="shrink-0 text-xs text-muted-foreground">UNIQUE</span>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  {FIELD_TYPE_LABELS[field.field_type]}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setRemoveTargetId(field.id) }}
                  className="text-xs text-muted-foreground hover:text-destructive"
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>
            {field.slug && (
              <p className="mt-1 truncate text-xs text-muted-foreground">ID: {field.slug}</p>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!removeTargetId}
        onOpenChange={(open) => !open && setRemoveTargetId(null)}
        title="항목을 제거하시겠습니까?"
        description="이 항목이 목록에서 제거됩니다."
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
