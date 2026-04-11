/**
 * RowContextMenu — Right-click context menu for row number cells.
 * Shows row insert/delete actions (Excel-like).
 */
import {
  ClipboardCopy,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect } from 'react'

interface RowContextMenuProps {
  position: { x: number; y: number } | null
  onClose: () => void
  onCopy?: () => void
  onInsertRowAbove?: () => void
  onInsertRowBelow?: () => void
  onDeleteRow?: () => void
  /** When true, only show read-only actions (copy). */
  readonly?: boolean
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-2 py-1 hover:bg-[#cce4f7] text-[11px] text-left ${destructive ? 'text-destructive' : ''}`}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
    </button>
  )
}

function Separator() {
  return <div className="my-0.5 h-px bg-[#d4d4d4]" />
}

export default function RowContextMenu({
  position,
  onClose,
  onCopy,
  onInsertRowAbove,
  onInsertRowBelow,
  onDeleteRow,
  readonly,
}: RowContextMenuProps) {
  useEffect(() => {
    if (!position) return
    const close = () => onClose()
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
    }
  }, [position, onClose])

  if (!position) return null

  return (
    <div
      className="fixed z-50 min-w-[140px] border border-[#d4d4d4] bg-white p-0.5 text-[11px] shadow-sm"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {onCopy && (
        <MenuItem icon={ClipboardCopy} label="행 복사" onClick={() => { onCopy(); onClose() }} />
      )}

      {!readonly && (onInsertRowAbove || onInsertRowBelow) && (
        <>
          {onCopy && <Separator />}
          {onInsertRowAbove && (
            <MenuItem icon={Plus} label="위에 행 삽입" onClick={() => { onInsertRowAbove(); onClose() }} />
          )}
          {onInsertRowBelow && (
            <MenuItem icon={Plus} label="아래에 행 삽입" onClick={() => { onInsertRowBelow(); onClose() }} />
          )}
        </>
      )}

      {!readonly && onDeleteRow && (
        <>
          <Separator />
          <MenuItem icon={Trash2} label="행 삭제" onClick={() => { onDeleteRow(); onClose() }} destructive />
        </>
      )}
    </div>
  )
}
