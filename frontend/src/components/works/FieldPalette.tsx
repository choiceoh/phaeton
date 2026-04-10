import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { FIELD_TYPE_ICONS, FIELD_TYPE_LABELS } from '@/lib/constants'
import type { FieldType } from '@/lib/types'

interface Props {
  onAdd: (fieldType: FieldType, presetOptions?: Record<string, unknown>) => void
  collapsed?: boolean
}

const DATA_ORDER: FieldType[] = [
  'text',
  'textarea',
  'number',
  'integer',
  'date',
  'datetime',
  'time',
  'select',
  'multiselect',
  'relation',
  'user',
  'file',
]

const ADVANCED_ORDER: FieldType[] = ['boolean', 'json', 'autonumber']

const LAYOUT_ORDER: FieldType[] = ['label', 'line', 'spacer']

function PaletteButton({ icon, label, onClick }: { icon: string, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
    >
      <span className="w-5 text-center text-xs">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

export default function FieldPalette({ onAdd, collapsed = false }: Props) {
  const [dataOpen, setDataOpen] = useState(!collapsed)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(!collapsed)

  return (
    <div className="space-y-3">
      <div>
        <button
          onClick={() => setDataOpen(!dataOpen)}
          className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {dataOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          데이터 컴포넌트
        </button>
        {dataOpen && (
          <div className="space-y-1">
            {DATA_ORDER.map((type) => (
              <PaletteButton
                key={type}
                icon={FIELD_TYPE_ICONS[type]}
                label={FIELD_TYPE_LABELS[type]}
                onClick={() => onAdd(type)}
              />
            ))}
            <PaletteButton icon="◉" label="단일 선택 (라디오)" onClick={() => onAdd('select', { display: 'radio' })} />
            <PaletteButton icon="₩" label="통화" onClick={() => onAdd('number', { display_type: 'currency', currency_code: 'KRW' })} />
            <PaletteButton icon="%" label="퍼센트" onClick={() => onAdd('number', { display_type: 'percent' })} />
            <PaletteButton icon="★" label="별점" onClick={() => onAdd('number', { display_type: 'rating', max_rating: 5 })} />
            <PaletteButton icon="▰" label="진행률" onClick={() => onAdd('number', { display_type: 'progress' })} />
            <PaletteButton icon="🌐" label="URL" onClick={() => onAdd('text', { display_type: 'url', validation: 'url' })} />
            <PaletteButton icon="✉" label="이메일" onClick={() => onAdd('text', { display_type: 'email', validation: 'email' })} />
            <PaletteButton icon="📞" label="전화번호" onClick={() => onAdd('text', { display_type: 'phone', validation: 'phone' })} />
          </div>
        )}
      </div>
      <div>
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          고급
        </button>
        {advancedOpen && (
          <div className="space-y-1">
            {ADVANCED_ORDER.map((type) => (
              <PaletteButton
                key={type}
                icon={FIELD_TYPE_ICONS[type]}
                label={FIELD_TYPE_LABELS[type]}
                onClick={() => onAdd(type)}
              />
            ))}
          </div>
        )}
      </div>
      <div>
        <button
          onClick={() => setLayoutOpen(!layoutOpen)}
          className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {layoutOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          디자인 컴포넌트
        </button>
        {layoutOpen && (
          <div className="space-y-1">
            {LAYOUT_ORDER.map((type) => (
              <PaletteButton
                key={type}
                icon={FIELD_TYPE_ICONS[type]}
                label={FIELD_TYPE_LABELS[type]}
                onClick={() => onAdd(type)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
