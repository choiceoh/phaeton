/**
 * GridContextMenu — Right-click context menu for spreadsheet cells.
 */
import { ClipboardCopy, ClipboardPaste, Eraser, Trash2 } from 'lucide-react'
import { useEffect } from 'react'

interface GridContextMenuProps {
  position: { x: number; y: number } | null
  onCopy: () => void
  onPaste: () => void
  onDeleteRow: () => void
  onClearCell: () => void
  onClose: () => void
  canDelete?: boolean
}

export default function GridContextMenu({
  position,
  onCopy,
  onPaste,
  onDeleteRow,
  onClearCell,
  onClose,
  canDelete = true,
}: GridContextMenuProps) {
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
      className="fixed z-50 min-w-[160px] rounded-lg border bg-popover p-1 text-sm shadow-md"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        onClick={() => { onCopy(); onClose() }}
      >
        <ClipboardCopy className="h-3.5 w-3.5" />
        복사
        <span className="ml-auto text-xs text-muted-foreground">Ctrl+C</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        onClick={() => { onPaste(); onClose() }}
      >
        <ClipboardPaste className="h-3.5 w-3.5" />
        붙여넣기
        <span className="ml-auto text-xs text-muted-foreground">Ctrl+V</span>
      </button>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        onClick={() => { onClearCell(); onClose() }}
      >
        <Eraser className="h-3.5 w-3.5" />
        셀 지우기
        <span className="ml-auto text-xs text-muted-foreground">Del</span>
      </button>
      {canDelete && (
        <>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-destructive"
            onClick={() => { onDeleteRow(); onClose() }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            행 삭제
          </button>
        </>
      )}
    </div>
  )
}
