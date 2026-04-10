import { FIELD_TYPE_LABELS, WIDTH_OPTIONS, HEIGHT_OPTIONS } from '@/lib/constants'
import type { FieldType } from '@/lib/types'

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

  return (
    <div className="space-y-2">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">필드 목록</h3>
      <div className="space-y-2">
        {fields.map((field, i) => (
          <div
            key={field.id}
            className={`cursor-pointer rounded-md border p-3 transition-colors ${
              selectedId === field.id ? 'border-primary bg-accent' : 'hover:bg-accent/50'
            }`}
            onClick={() => onSelect(field.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, i)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{field.label || '(제목 없음)'}</span>
                {field.is_required && <span className="text-xs text-destructive">*</span>}
                {field.is_unique && <span className="text-xs text-muted-foreground">UNIQUE</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {FIELD_TYPE_LABELS[field.field_type]}
                </span>
                {(field.width !== 6 || field.height !== 1) && (
                  <span className="text-xs text-muted-foreground">
                    {WIDTH_OPTIONS.find((o) => o.value === field.width)?.label ?? field.width}
                    {field.height !== 1 && ` / ${HEIGHT_OPTIONS.find((o) => o.value === field.height)?.label ?? field.height}`}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(field.id) }}
                  className="text-xs text-muted-foreground hover:text-destructive"
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>
            {field.slug && (
              <p className="mt-1 text-xs text-muted-foreground">slug: {field.slug}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
