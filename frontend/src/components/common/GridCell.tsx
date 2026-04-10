import { CheckIcon, Loader2Icon, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
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
  onSave,
  onEditCancel,
  onClick,
  onDoubleClick,
}: GridCellProps) {
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      setEditValue(rawValue == null ? '' : String(rawValue))
      // Focus in next tick so value is set.
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isEditing, rawValue])

  function commitEdit() {
    const newValue = editValue === '' ? null : editValue
    if (String(rawValue ?? '') !== String(newValue ?? '')) {
      onSave(newValue)
    }
    onEditCancel()
  }

  if (isEditing && editable) {
    return (
      <Input
        ref={inputRef}
        className="h-7 text-sm border-primary ring-1 ring-primary"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          // Enter and Tab are handled by the grid navigation hook via container keydown.
          // But blur-triggered commit handles the save.
          if (e.key === 'Escape') {
            e.preventDefault()
            onEditCancel()
          }
          // Stop propagation so the grid navigation doesn't also handle these keys.
          e.stopPropagation()
        }}
        onClick={(e) => e.stopPropagation()}
      />
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
      {children}
      {saving && (
        <span className="absolute right-0.5 top-1/2 -translate-y-1/2">
          <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
        </span>
      )}
      {saved && !saving && (
        <span className="absolute right-0.5 top-1/2 -translate-y-1/2">
          <CheckIcon className="size-3 text-green-600" />
        </span>
      )}
      {editable && !isActive && !saving && !saved && (
        <Pencil className="absolute right-0.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 opacity-0 group-hover/cell:opacity-100 pointer-events-none" />
      )}
    </div>
  )
}
