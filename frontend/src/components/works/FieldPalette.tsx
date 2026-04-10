import { FIELD_TYPE_ICONS, FIELD_TYPE_LABELS } from '@/lib/constants'
import type { FieldType } from '@/lib/types'

interface Props {
  onAdd: (fieldType: FieldType, presetOptions?: Record<string, unknown>) => void
}

const DATA_ORDER: FieldType[] = [
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
  'autonumber',
]

const LAYOUT_ORDER: FieldType[] = ['label', 'line', 'spacer']

export default function FieldPalette({ onAdd }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">데이터 컴포넌트</h3>
        <div className="space-y-1">
          {DATA_ORDER.map((type) => (
            <button
              key={type}
              onClick={() => onAdd(type)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="w-5 text-center text-xs">{FIELD_TYPE_ICONS[type]}</span>
              <span>{FIELD_TYPE_LABELS[type]}</span>
            </button>
          ))}
          <button
            onClick={() => onAdd('select', { display: 'radio' })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="w-5 text-center text-xs">◉</span>
            <span>단일 선택 (라디오)</span>
          </button>
          <button
            onClick={() => onAdd('number', { display_type: 'currency', currency_code: 'KRW' })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="w-5 text-center text-xs">₩</span>
            <span>통화</span>
          </button>
          <button
            onClick={() => onAdd('number', { display_type: 'percent' })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="w-5 text-center text-xs">%</span>
            <span>퍼센트</span>
          </button>
          <button
            onClick={() => onAdd('number', { display_type: 'rating', max_rating: 5 })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="w-5 text-center text-xs">★</span>
            <span>별점</span>
          </button>
          <button
            onClick={() => onAdd('number', { display_type: 'progress' })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="w-5 text-center text-xs">▰</span>
            <span>진행률</span>
          </button>
          <button
            onClick={() => onAdd('text', { display_type: 'url', validation: 'url' })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="w-5 text-center text-xs">🌐</span>
            <span>URL</span>
          </button>
          <button
            onClick={() => onAdd('text', { display_type: 'email', validation: 'email' })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="w-5 text-center text-xs">✉</span>
            <span>이메일</span>
          </button>
          <button
            onClick={() => onAdd('text', { display_type: 'phone', validation: 'phone' })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="w-5 text-center text-xs">📞</span>
            <span>전화번호</span>
          </button>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">디자인 컴포넌트</h3>
        <div className="space-y-1">
          {LAYOUT_ORDER.map((type) => (
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
      </div>
    </div>
  )
}
