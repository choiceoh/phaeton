import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { FIELD_TYPE_ICONS, FIELD_TYPE_LABELS } from '@/lib/constants'
import type { FieldType } from '@/lib/types'

interface Props {
  onAdd: (fieldType: FieldType, presetOptions?: Record<string, unknown>) => void
  collapsed?: boolean
}

interface PaletteEntry {
  icon: string
  label: string
  type: FieldType
  presetOptions?: Record<string, unknown>
}

const GROUPED_DATA: PaletteEntry[] = [
  { icon: FIELD_TYPE_ICONS.text, label: '텍스트', type: 'text' },
  { icon: FIELD_TYPE_ICONS.number, label: '숫자', type: 'number' },
  { icon: FIELD_TYPE_ICONS.date, label: '날짜', type: 'date' },
  { icon: FIELD_TYPE_ICONS.select, label: '선택', type: 'select' },
]

const OTHER_DATA: PaletteEntry[] = [
  { icon: FIELD_TYPE_ICONS.relation, label: FIELD_TYPE_LABELS.relation, type: 'relation' },
  { icon: FIELD_TYPE_ICONS.user, label: FIELD_TYPE_LABELS.user, type: 'user' },
  { icon: FIELD_TYPE_ICONS.file, label: FIELD_TYPE_LABELS.file, type: 'file' },
]

const ADVANCED_ORDER: FieldType[] = ['boolean', 'json', 'autonumber', 'formula']

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
            {GROUPED_DATA.map((entry) => (
              <PaletteButton
                key={entry.type}
                icon={entry.icon}
                label={entry.label}
                onClick={() => onAdd(entry.type, entry.presetOptions)}
              />
            ))}
            {OTHER_DATA.map((entry) => (
              <PaletteButton
                key={entry.type}
                icon={entry.icon}
                label={entry.label}
                onClick={() => onAdd(entry.type, entry.presetOptions)}
              />
            ))}
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
