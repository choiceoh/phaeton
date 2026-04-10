import { useState } from 'react'

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

const DATA_ENTRIES: PaletteEntry[] = [
  { icon: FIELD_TYPE_ICONS.text, label: '텍스트', type: 'text' },
  { icon: FIELD_TYPE_ICONS.number, label: '숫자', type: 'number' },
  { icon: FIELD_TYPE_ICONS.date, label: '날짜', type: 'date' },
  { icon: FIELD_TYPE_ICONS.select, label: '선택', type: 'select' },
  { icon: FIELD_TYPE_ICONS.relation, label: FIELD_TYPE_LABELS.relation, type: 'relation' },
  { icon: FIELD_TYPE_ICONS.user, label: FIELD_TYPE_LABELS.user, type: 'user' },
  { icon: FIELD_TYPE_ICONS.file, label: FIELD_TYPE_LABELS.file, type: 'file' },
]

const DESIGN_ENTRIES: PaletteEntry[] = [
  { icon: FIELD_TYPE_ICONS.label, label: FIELD_TYPE_LABELS.label, type: 'label' },
  { icon: FIELD_TYPE_ICONS.line, label: FIELD_TYPE_LABELS.line, type: 'line' },
  { icon: FIELD_TYPE_ICONS.spacer, label: FIELD_TYPE_LABELS.spacer, type: 'spacer' },
]

const FORMULA_ENTRIES: PaletteEntry[] = [
  { icon: FIELD_TYPE_ICONS.formula, label: FIELD_TYPE_LABELS.formula, type: 'formula' },
  { icon: FIELD_TYPE_ICONS.lookup, label: FIELD_TYPE_LABELS.lookup, type: 'lookup' },
  { icon: FIELD_TYPE_ICONS.rollup, label: FIELD_TYPE_LABELS.rollup, type: 'rollup' },
]

const ADVANCED_ENTRIES: PaletteEntry[] = [
  { icon: FIELD_TYPE_ICONS.boolean, label: FIELD_TYPE_LABELS.boolean, type: 'boolean' },
  { icon: FIELD_TYPE_ICONS.json, label: FIELD_TYPE_LABELS.json, type: 'json' },
  { icon: FIELD_TYPE_ICONS.autonumber, label: FIELD_TYPE_LABELS.autonumber, type: 'autonumber' },
]

type TabKey = 'data' | 'design' | 'formula' | 'advanced'

const TABS: { key: TabKey; label: string; entries: PaletteEntry[] }[] = [
  { key: 'data', label: '데이터', entries: DATA_ENTRIES },
  { key: 'design', label: '디자인', entries: DESIGN_ENTRIES },
  { key: 'formula', label: '수식', entries: FORMULA_ENTRIES },
  { key: 'advanced', label: '고급', entries: ADVANCED_ENTRIES },
]

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

export default function FieldPalette({ onAdd }: Props) {
  const [tab, setTab] = useState<TabKey>('data')
  const activeTab = TABS.find((t) => t.key === tab)!

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-md border p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`flex-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {activeTab.entries.map((entry) => (
          <PaletteButton
            key={entry.type}
            icon={entry.icon}
            label={entry.label}
            onClick={() => onAdd(entry.type, entry.presetOptions)}
          />
        ))}
      </div>
    </div>
  )
}
