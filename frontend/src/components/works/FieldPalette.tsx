import { FIELD_TYPE_ICONS, FIELD_TYPE_LABELS } from '@/lib/constants'
import type { FieldType } from '@/lib/types'

interface Props {
  onAdd: (fieldType: FieldType) => void
}

const ORDER: FieldType[] = [
  'text',
  'textarea',
  'number',
  'integer',
  'boolean',
  'date',
  'datetime',
  'time',
  'select',
  'multiselect',
  'relation',
  'user',
  'file',
  'json',
]

export default function FieldPalette({ onAdd }: Props) {
  return (
    <div className="space-y-1">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">필드 추가</h3>
      {ORDER.map((type) => (
        <button
          key={type}
          onClick={() => onAdd(type)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
        >
          <span className="w-5 text-center text-xs">{FIELD_TYPE_ICONS[type]}</span>
          <span>{FIELD_TYPE_LABELS[type]}</span>
        </button>
      ))}
    </div>
  )
}
