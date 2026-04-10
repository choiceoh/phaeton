import { useState } from 'react'

import {
  AlignLeft,
  Binary,
  Braces,
  Calendar,
  CalendarClock,
  ChevronDown,
  Clock,
  Link,
  ListChecks,
  ListOrdered,
  Minus,
  Paperclip,
  Search,
  Sigma,
  Square,
  SquareCheck,
  Table2,
  Tag,
  Type,
  User,
  Hash,
} from 'lucide-react'

import { FIELD_TYPE_LABELS } from '@/lib/constants'
import type { FieldType } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'

interface PaletteEntry {
  icon: LucideIcon
  label: string
  type: FieldType
  presetOptions?: Record<string, unknown>
}

const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  integer: Binary,
  boolean: SquareCheck,
  date: Calendar,
  datetime: CalendarClock,
  time: Clock,
  select: ChevronDown,
  multiselect: ListChecks,
  relation: Link,
  user: User,
  file: Paperclip,
  json: Braces,
  autonumber: ListOrdered,
  formula: Sigma,
  lookup: Search,
  rollup: Sigma,
  label: Tag,
  line: Minus,
  table: Table2,
  spacer: Square,
}

const DATA_ENTRIES: PaletteEntry[] = [
  { icon: FIELD_ICONS.text, label: '텍스트', type: 'text' },
  { icon: FIELD_ICONS.number, label: '숫자', type: 'number' },
  { icon: FIELD_ICONS.date, label: '날짜', type: 'date' },
  { icon: FIELD_ICONS.select, label: '선택', type: 'select' },
  { icon: FIELD_ICONS.relation, label: FIELD_TYPE_LABELS.relation, type: 'relation' },
  { icon: FIELD_ICONS.user, label: FIELD_TYPE_LABELS.user, type: 'user' },
  { icon: FIELD_ICONS.file, label: FIELD_TYPE_LABELS.file, type: 'file' },
]

const DESIGN_ENTRIES: PaletteEntry[] = [
  { icon: FIELD_ICONS.label, label: FIELD_TYPE_LABELS.label, type: 'label' },
  { icon: FIELD_ICONS.line, label: FIELD_TYPE_LABELS.line, type: 'line' },
  { icon: FIELD_ICONS.spacer, label: FIELD_TYPE_LABELS.spacer, type: 'spacer' },
]

const ADVANCED_ENTRIES: PaletteEntry[] = [
  { icon: FIELD_ICONS.formula, label: FIELD_TYPE_LABELS.formula, type: 'formula' },
  { icon: FIELD_ICONS.lookup, label: FIELD_TYPE_LABELS.lookup, type: 'lookup' },
  { icon: FIELD_ICONS.rollup, label: FIELD_TYPE_LABELS.rollup, type: 'rollup' },
  { icon: FIELD_ICONS.boolean, label: FIELD_TYPE_LABELS.boolean, type: 'boolean' },
  { icon: FIELD_ICONS.table, label: FIELD_TYPE_LABELS.table, type: 'table' },
  { icon: FIELD_ICONS.json, label: FIELD_TYPE_LABELS.json, type: 'json' },
  { icon: FIELD_ICONS.autonumber, label: FIELD_TYPE_LABELS.autonumber, type: 'autonumber' },
]

type TabKey = 'data' | 'design' | 'advanced'

const TABS: { key: TabKey; label: string; entries: PaletteEntry[] }[] = [
  { key: 'data', label: '데이터', entries: DATA_ENTRIES },
  { key: 'design', label: '디자인', entries: DESIGN_ENTRIES },
  { key: 'advanced', label: '고급', entries: ADVANCED_ENTRIES },
]

function PaletteButton({ icon: Icon, label, entry }: { icon: LucideIcon, label: string, entry: PaletteEntry }) {
  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(
      'application/palette-field',
      JSON.stringify({ type: entry.type, presetOptions: entry.presetOptions }),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex w-full cursor-grab items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      tabIndex={0}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{label}</span>
    </div>
  )
}

export default function FieldPalette() {
  const [tab, setTab] = useState<TabKey>('data')
  const activeTab = TABS.find((t) => t.key === tab)!

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-lg border p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1 text-sm font-medium transition-colors ${
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
            entry={entry}
          />
        ))}
      </div>
    </div>
  )
}
