/**
 * GridCell — Inline cell editor dispatcher for spreadsheet view.
 *
 * Renders either the display value or a field-type-specific inline editor.
 * When editing, the appropriate input component is rendered with autoFocus.
 * Save state feedback (spinner/checkmark) is shown after edits.
 */
import { Check, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { MICRO, FAST } from '@/lib/motion'

import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import RelationCombobox from '@/components/common/RelationCombobox'
import UserCombobox from '@/components/common/UserCombobox'
import { getChoices, getDecimalPlaces } from '@/lib/fieldGuards'
import type { Field } from '@/lib/types'

import type { CellSaveState } from '@/hooks/useInlineEditing'

interface GridCellProps {
  field: Field | null
  value: unknown
  isEditing: boolean
  editValue: unknown
  onEditValueChange: (v: unknown) => void
  onCommit: () => void
  onCancel: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  saveState: CellSaveState | null
  displayContent: React.ReactNode
}

export default function GridCell({
  field,
  value,
  isEditing,
  editValue,
  onEditValueChange,
  onCommit,
  onCancel,
  onKeyDown,
  saveState,
  displayContent,
}: GridCellProps) {
  if (!isEditing) {
    return (
      <div className="flex items-center gap-1 min-h-[24px] w-full">
        <span className="flex-1 truncate">{displayContent}</span>
        <AnimatePresence mode="wait">
          {saveState === 'saving' && (
            <motion.span
              key="saving"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={MICRO}
              className="shrink-0 inline-flex"
            >
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </motion.span>
          )}
          {saveState === 'saved' && (
            <motion.span
              key="saved"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={FAST}
              className="shrink-0 inline-flex"
            >
              <Check className="h-3 w-3 text-green-500" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    )
  }

  if (!field) return <>{displayContent}</>

  switch (field.field_type) {
    case 'text':
      return (
        <TextEditor
          value={editValue as string}
          onChange={onEditValueChange}
          onKeyDown={onKeyDown}
          onCommit={onCommit}
        />
      )

    case 'textarea':
      return (
        <TextareaEditor
          value={editValue as string}
          onChange={onEditValueChange}
          onKeyDown={onKeyDown}
          onCommit={onCommit}
        />
      )

    case 'number':
    case 'integer':
      return (
        <NumberEditor
          value={editValue}
          onChange={onEditValueChange}
          onKeyDown={onKeyDown}
          onCommit={onCommit}
          isInteger={getDecimalPlaces(field) === 0}
        />
      )

    case 'boolean':
      // Boolean toggles immediately in useInlineEditing, should not reach here.
      return (
        <Checkbox
          checked={!!value}
          className="mx-auto"
        />
      )

    case 'date':
      return (
        <DateEditor
          value={editValue as string}
          onChange={onEditValueChange}
          onKeyDown={onKeyDown}
          onCommit={onCommit}
        />
      )

    case 'datetime':
      return (
        <DatetimeEditor
          value={editValue as string}
          onChange={onEditValueChange}
          onKeyDown={onKeyDown}
          onCommit={onCommit}
        />
      )

    case 'time':
      return (
        <TimeEditor
          value={editValue as string}
          onChange={onEditValueChange}
          onKeyDown={onKeyDown}
          onCommit={onCommit}
        />
      )

    case 'select':
      return (
        <SelectEditor
          value={editValue as string}
          choices={getChoices(field)}
          onChange={(v) => {
            onEditValueChange(v)
            // Auto-commit on selection
            setTimeout(() => onCommit(), 0)
          }}
          onKeyDown={onKeyDown}
        />
      )

    case 'multiselect':
      return (
        <MultiselectEditor
          value={editValue as string[] ?? []}
          choices={getChoices(field)}
          onChange={onEditValueChange}
          onKeyDown={onKeyDown}
          onCommit={onCommit}
        />
      )

    case 'relation': {
      const targetId = field.relation?.target_collection_id
      if (!targetId) return <>{displayContent}</>
      return (
        <RelationEditor
          targetCollectionId={targetId}
          value={editValue as string}
          onChange={(v) => {
            onEditValueChange(v)
            setTimeout(() => onCommit(), 0)
          }}
          onCancel={onCancel}
        />
      )
    }

    case 'user':
      return (
        <UserEditor
          value={editValue as string}
          onChange={(v) => {
            onEditValueChange(v)
            setTimeout(() => onCommit(), 0)
          }}
          onCancel={onCancel}
        />
      )

    default:
      return <>{displayContent}</>
  }
}

// --- Individual editors ---

function TextEditor({
  value,
  onChange,
  onKeyDown,
  onCommit,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCommit: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      type="text"
      className="w-full h-full bg-transparent border-none outline-none text-sm px-0"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onCommit}
    />
  )
}

function TextareaEditor({
  value,
  onChange,
  onKeyDown,
  onCommit,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCommit: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <textarea
      ref={ref}
      className="w-full bg-transparent border-none outline-none text-sm px-0 resize-none"
      rows={2}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Ctrl+Enter to commit textarea
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          onCommit()
          return
        }
        // Allow plain Enter for newlines, but still handle Tab/Escape
        if (e.key !== 'Enter') {
          onKeyDown(e)
        }
      }}
      onBlur={onCommit}
    />
  )
}

function NumberEditor({
  value,
  onChange,
  onKeyDown,
  onCommit,
  isInteger,
}: {
  value: unknown
  onChange: (v: unknown) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCommit: () => void
  isInteger: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      type="number"
      step={isInteger ? '1' : 'any'}
      className="w-full h-full bg-transparent border-none outline-none text-sm px-0 [&::-webkit-inner-spin-button]:appearance-none"
      value={value != null ? String(value) : ''}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') {
          onChange(null)
        } else {
          onChange(isInteger ? parseInt(raw, 10) : parseFloat(raw))
        }
      }}
      onKeyDown={onKeyDown}
      onBlur={onCommit}
    />
  )
}

function DateEditor({
  value,
  onChange,
  onKeyDown,
  onCommit,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCommit: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  // Convert ISO date to YYYY-MM-DD for input
  const dateStr = value ? new Date(value).toISOString().split('T')[0] : ''

  return (
    <input
      ref={ref}
      type="date"
      className="w-full h-full bg-transparent border-none outline-none text-sm px-0"
      value={dateStr}
      onChange={(e) => onChange(e.target.value || '')}
      onKeyDown={onKeyDown}
      onBlur={onCommit}
    />
  )
}

function DatetimeEditor({
  value,
  onChange,
  onKeyDown,
  onCommit,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCommit: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const dtStr = value ? new Date(value).toISOString().slice(0, 16) : ''

  return (
    <input
      ref={ref}
      type="datetime-local"
      className="w-full h-full bg-transparent border-none outline-none text-sm px-0"
      value={dtStr}
      onChange={(e) => onChange(e.target.value || '')}
      onKeyDown={onKeyDown}
      onBlur={onCommit}
    />
  )
}

function TimeEditor({
  value,
  onChange,
  onKeyDown,
  onCommit,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCommit: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <input
      ref={ref}
      type="time"
      className="w-full h-full bg-transparent border-none outline-none text-sm px-0"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value || '')}
      onKeyDown={onKeyDown}
      onBlur={onCommit}
    />
  )
}

function SelectEditor({
  value,
  choices,
  onChange,
  onKeyDown,
}: {
  value: string
  choices: string[]
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div onKeyDown={onKeyDown}>
      <Select
        open={open}
        onOpenChange={setOpen}
        value={String(value ?? '')}
        onValueChange={(v) => { if (v) onChange(v) }}
      >
        <SelectTrigger className="h-7 border-none shadow-none px-0 text-sm">
          <SelectValue placeholder="선택" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function MultiselectEditor({
  value,
  choices,
  onChange,
  onKeyDown,
  onCommit,
}: {
  value: string[]
  choices: string[]
  onChange: (v: string[]) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCommit: () => void
}) {
  const selected = new Set(value ?? [])

  const toggle = (c: string) => {
    const next = new Set(selected)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    onChange(Array.from(next))
  }

  return (
    <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto text-sm" onKeyDown={onKeyDown}>
      {choices.map((c) => (
        <label key={c} className="flex items-center gap-1.5 px-1 py-0.5 hover:bg-accent rounded cursor-pointer">
          <Checkbox
            checked={selected.has(c)}
            onCheckedChange={() => toggle(c)}
          />
          <span className="truncate">{c}</span>
        </label>
      ))}
      <button
        type="button"
        className="text-xs text-primary mt-1 px-1"
        onClick={onCommit}
      >
        확인
      </button>
    </div>
  )
}

function RelationEditor({
  targetCollectionId,
  value,
  onChange,
  onCancel,
}: {
  targetCollectionId: string
  value: string
  onChange: (v: string | null) => void
  onCancel: () => void
}) {
  return (
    <div className="w-full" onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
      <RelationCombobox
        targetCollectionId={targetCollectionId}
        value={value ? String(value) : undefined}
        onChange={onChange}
        placeholder="선택"
      />
    </div>
  )
}

function UserEditor({
  value,
  onChange,
  onCancel,
}: {
  value: string
  onChange: (v: unknown) => void
  onCancel: () => void
}) {
  return (
    <div className="w-full" onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
      <UserCombobox
        value={value ? String(value) : undefined}
        onChange={onChange}
        placeholder="사용자 선택"
      />
    </div>
  )
}
