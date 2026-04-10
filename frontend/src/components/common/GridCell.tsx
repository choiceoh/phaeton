import { CheckIcon, Loader2Icon, Pencil, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { FieldType } from '@/lib/types'
import { cn } from '@/lib/utils'

interface GridCellProps {
  children: React.ReactNode
  rawValue: unknown
  columnId: string
  rowId: string
  isActive: boolean
  isSelected: boolean
  isEditing: boolean
  editable: boolean
  saving?: boolean
  saved?: boolean
  error?: boolean
  fieldType?: FieldType
  fieldOptions?: Record<string, unknown>
  onSave: (value: unknown) => void
  onEditStart: () => void
  onEditCancel: () => void
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
}

export default function GridCell({
  children,
  rawValue,
  isActive,
  isSelected,
  isEditing,
  editable,
  saving,
  saved,
  error,
  fieldType,
  fieldOptions,
  onSave,
  onEditCancel,
  onClick,
  onDoubleClick,
}: GridCellProps) {
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        setEditValue(rawValue == null ? '' : String(rawValue))
        if (fieldType === 'textarea') {
          textareaRef.current?.focus()
          textareaRef.current?.select()
        } else {
          inputRef.current?.focus()
          inputRef.current?.select()
        }
      })
    }
  }, [isEditing, rawValue, fieldType])

  function commitEdit(value?: unknown) {
    const newValue = value !== undefined ? value : (editValue === '' ? null : editValue)
    if (String(rawValue ?? '') !== String(newValue ?? '')) {
      onSave(newValue)
    }
    onEditCancel()
  }

  // Shared keydown handler for text-like inputs.
  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ;(e.target as HTMLElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onEditCancel()
    }
    e.stopPropagation()
  }

  if (isEditing && editable) {
    // Boolean — toggle immediately, no text input needed.
    if (fieldType === 'boolean') {
      const next = !rawValue
      // Commit synchronously and close.
      requestAnimationFrame(() => commitEdit(next))
      return <>{children}</>
    }

    // Select — dropdown.
    if (fieldType === 'select') {
      const choices = (Array.isArray(fieldOptions?.choices) ? fieldOptions.choices : []) as string[]
      return (
        <Select
          defaultValue={rawValue == null ? '' : String(rawValue)}
          onValueChange={(v) => commitEdit(v)}
          open
          onOpenChange={(open) => { if (!open) onEditCancel() }}
        >
          <SelectTrigger className="h-7 text-sm border-primary ring-1 ring-primary">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    // Textarea — multiline.
    if (fieldType === 'textarea') {
      return (
        <Textarea
          ref={textareaRef}
          className="min-h-[56px] text-sm border-primary ring-1 ring-primary resize-none"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              textareaRef.current?.blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onEditCancel()
            }
            e.stopPropagation()
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )
    }

    // Date / datetime / time — native date input.
    if (fieldType === 'date' || fieldType === 'datetime') {
      const inputType = fieldType === 'datetime' ? 'datetime-local' : 'date'
      return (
        <Input
          ref={inputRef}
          type={inputType}
          className="h-7 text-sm border-primary ring-1 ring-primary"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit()}
          onKeyDown={handleInputKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      )
    }

    if (fieldType === 'time') {
      return (
        <Input
          ref={inputRef}
          type="time"
          className="h-7 text-sm border-primary ring-1 ring-primary"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit()}
          onKeyDown={handleInputKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      )
    }

    // Number / integer — numeric input.
    if (fieldType === 'number' || fieldType === 'integer') {
      return (
        <Input
          ref={inputRef}
          type="number"
          step={fieldType === 'integer' ? '1' : 'any'}
          className="h-7 text-sm border-primary ring-1 ring-primary"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit()}
          onKeyDown={handleInputKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      )
    }

    // Default — plain text input.
    return (
      <Input
        ref={inputRef}
        className="h-7 text-sm border-primary ring-1 ring-primary"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => commitEdit()}
        onKeyDown={handleInputKeyDown}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  // Boolean read-only cell — show checkbox.
  if (fieldType === 'boolean' && editable) {
    return (
      <div
        className={cn(
          'group/cell relative min-h-[28px] px-1 -mx-1 rounded-sm cursor-pointer',
          isActive && 'ring-2 ring-primary ring-inset',
          isSelected && !isActive && 'bg-primary/10',
          saved && 'animate-cell-saved',
          error && 'ring-2 ring-destructive ring-inset animate-shake',
        )}
        onClick={(e) => {
          e.stopPropagation()
          onClick(e)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          // Toggle on double-click for booleans.
          onSave(!rawValue)
        }}
      >
        <Checkbox
          checked={!!rawValue}
          onCheckedChange={(checked) => onSave(!!checked)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
        />
        {saving && (
          <span className="absolute right-0.5 top-1/2 -translate-y-1/2">
            <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
          </span>
        )}
        {saved && !saving && (
          <span className="absolute right-0.5 top-1/2 -translate-y-1/2 animate-check-fade">
            <CheckIcon className="size-3.5 text-foreground/70" />
          </span>
        )}
        {error && !saving && (
          <span className="absolute right-0.5 top-1/2 -translate-y-1/2">
            <XCircle className="size-3.5 text-destructive" />
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group/cell relative min-h-[28px] px-1 -mx-1 rounded-sm',
        editable ? 'cursor-cell' : 'cursor-default',
        isActive && 'ring-2 ring-primary ring-inset',
        isSelected && !isActive && 'bg-primary/10',
        saved && 'animate-cell-saved',
        error && 'ring-2 ring-destructive ring-inset animate-shake',
      )}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (editable) onDoubleClick()
      }}
    >
      <span className="block truncate">{children}</span>
      {saving && (
        <span className="absolute right-0.5 top-1/2 -translate-y-1/2">
          <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
        </span>
      )}
      {saved && !saving && (
        <span className="absolute right-0.5 top-1/2 -translate-y-1/2 animate-check-fade">
          <CheckIcon className="size-3.5 text-foreground/70" />
        </span>
      )}
      {error && !saving && (
        <span className="absolute right-0.5 top-1/2 -translate-y-1/2">
          <XCircle className="size-3.5 text-destructive" />
        </span>
      )}
      {editable && !isActive && !saving && !saved && !error && (
        <Pencil className="absolute right-0.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 opacity-0 group-hover/cell:opacity-100 pointer-events-none" />
      )}
    </div>
  )
}
