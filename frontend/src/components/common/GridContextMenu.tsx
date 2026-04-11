/**
 * GridContextMenu — Right-click context menu for spreadsheet cells.
 * Excel-like menu with copy/paste, row insert, sort, filter, and delete.
 */
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ClipboardCopy,
  ClipboardPaste,
  Eraser,
  Filter,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect } from 'react'

interface GridContextMenuProps {
  position: { x: number; y: number } | null
  onCopy: () => void
  onPaste: () => void
  onDeleteRow: () => void
  onClearCell: () => void
  onClose: () => void
  canDelete?: boolean
  onInsertRowAbove?: () => void
  onInsertRowBelow?: () => void
  onSortAscending?: () => void
  onSortDescending?: () => void
  onFilterByValue?: () => void
  cellValue?: unknown
  columnLabel?: string
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-left ${destructive ? 'text-destructive' : ''}`}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="ml-auto text-xs text-muted-foreground">{shortcut}</span>}
    </button>
  )
}

function Separator() {
  return <div className="my-1 h-px bg-border" />
}

export default function GridContextMenu({
  position,
  onCopy,
  onPaste,
  onDeleteRow,
  onClearCell,
  onClose,
  canDelete = true,
  onInsertRowAbove,
  onInsertRowBelow,
  onSortAscending,
  onSortDescending,
  onFilterByValue,
  cellValue,
  columnLabel,
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

  const truncatedValue = cellValue != null
    ? String(cellValue).length > 20
      ? String(cellValue).slice(0, 20) + '…'
      : String(cellValue)
    : null

  return (
    <div
      className="fixed z-50 min-w-[180px] rounded-lg border bg-popover p-1 text-sm shadow-md"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem icon={ClipboardCopy} label="복사" shortcut="Ctrl+C" onClick={() => { onCopy(); onClose() }} />
      <MenuItem icon={ClipboardPaste} label="붙여넣기" shortcut="Ctrl+V" onClick={() => { onPaste(); onClose() }} />

      <Separator />
      <MenuItem icon={Eraser} label="셀 지우기" shortcut="Del" onClick={() => { onClearCell(); onClose() }} />

      {(onInsertRowAbove || onInsertRowBelow) && (
        <>
          <Separator />
          {onInsertRowAbove && (
            <MenuItem icon={Plus} label="위에 행 삽입" onClick={() => { onInsertRowAbove(); onClose() }} />
          )}
          {onInsertRowBelow && (
            <MenuItem icon={Plus} label="아래에 행 삽입" onClick={() => { onInsertRowBelow(); onClose() }} />
          )}
        </>
      )}

      {(onSortAscending || onSortDescending) && (
        <>
          <Separator />
          {onSortAscending && (
            <MenuItem
              icon={ArrowUpAZ}
              label={columnLabel ? `${columnLabel} 오름차순` : '오름차순 정렬'}
              onClick={() => { onSortAscending(); onClose() }}
            />
          )}
          {onSortDescending && (
            <MenuItem
              icon={ArrowDownAZ}
              label={columnLabel ? `${columnLabel} 내림차순` : '내림차순 정렬'}
              onClick={() => { onSortDescending(); onClose() }}
            />
          )}
        </>
      )}

      {onFilterByValue && (
        <>
          <Separator />
          <MenuItem
            icon={Filter}
            label={truncatedValue != null ? `"${truncatedValue}" 필터` : '이 값으로 필터'}
            onClick={() => { onFilterByValue(); onClose() }}
          />
        </>
      )}

      {canDelete && (
        <>
          <Separator />
          <MenuItem icon={Trash2} label="행 삭제" onClick={() => { onDeleteRow(); onClose() }} destructive />
        </>
      )}
    </div>
  )
}
