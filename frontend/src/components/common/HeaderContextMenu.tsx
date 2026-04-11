/**
 * HeaderContextMenu — Right-click context menu for column headers.
 * Excel-like menu with sort, pin, hide, rename, insert, auto-fit, and delete.
 */
import {
  ArrowDownUp,
  ChevronsLeftRight,
  EyeOff,
  Pencil,
  PinIcon,
  PinOffIcon,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect } from 'react'

interface HeaderContextMenuProps {
  position: { x: number; y: number } | null
  onClose: () => void
  // Sort
  canSort?: boolean
  onSortAscending?: () => void
  onSortDescending?: () => void
  // Pin
  isPinned: false | 'left' | 'right'
  onPin?: (direction: false | 'left' | 'right') => void
  // Visibility
  canHide?: boolean
  onHide?: () => void
  // Column management (editable mode)
  columnManagement?: boolean
  columnLabel?: string
  onRename?: () => void
  onDelete?: () => void
  onInsertLeft?: () => void
  onInsertRight?: () => void
  // Auto-fit
  onAutoFitWidth?: () => void
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

export default function HeaderContextMenu({
  position,
  onClose,
  canSort,
  onSortAscending,
  onSortDescending,
  isPinned,
  onPin,
  canHide,
  onHide,
  columnManagement,
  onRename,
  onDelete,
  onInsertLeft,
  onInsertRight,
  onAutoFitWidth,
}: HeaderContextMenuProps) {
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
      className="fixed z-50 min-w-[160px] border border-[#d4d4d4] bg-white p-0.5 text-[11px] shadow-sm"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Sort */}
      {canSort && onSortAscending && onSortDescending && (
        <>
          <MenuItem icon={ArrowDownUp} label="오름차순 정렬" onClick={() => { onSortAscending(); onClose() }} />
          <MenuItem
            icon={({ className }) => <ArrowDownUp className={`${className} rotate-180`} />}
            label="내림차순 정렬"
            onClick={() => { onSortDescending(); onClose() }}
          />
          <Separator />
        </>
      )}

      {/* Pin */}
      {onPin && (
        <>
          {isPinned ? (
            <MenuItem icon={PinOffIcon} label="고정 해제" onClick={() => { onPin(false); onClose() }} />
          ) : (
            <>
              <MenuItem icon={PinIcon} label="왼쪽 고정" onClick={() => { onPin('left'); onClose() }} />
              <MenuItem
                icon={({ className }) => <PinIcon className={`${className} rotate-90`} />}
                label="오른쪽 고정"
                onClick={() => { onPin('right'); onClose() }}
              />
            </>
          )}
          <Separator />
        </>
      )}

      {/* Hide */}
      {canHide && onHide && (
        <MenuItem icon={EyeOff} label="열 숨기기" onClick={() => { onHide(); onClose() }} />
      )}

      {/* Auto-fit width */}
      {onAutoFitWidth && (
        <MenuItem icon={ChevronsLeftRight} label="열 너비 자동맞춤" onClick={() => { onAutoFitWidth(); onClose() }} />
      )}

      {/* Column management: insert, rename, delete */}
      {columnManagement && (onInsertLeft || onInsertRight || onRename || onDelete) && (
        <>
          <Separator />
          {onInsertLeft && (
            <MenuItem icon={Plus} label="왼쪽에 열 삽입" onClick={() => { onInsertLeft(); onClose() }} />
          )}
          {onInsertRight && (
            <MenuItem icon={Plus} label="오른쪽에 열 삽입" onClick={() => { onInsertRight(); onClose() }} />
          )}
          {onRename && (
            <>
              <Separator />
              <MenuItem icon={Pencil} label="이름 변경" onClick={() => { onRename(); onClose() }} />
            </>
          )}
          {onDelete && (
            <>
              <Separator />
              <MenuItem icon={Trash2} label="열 삭제" onClick={() => { onDelete(); onClose() }} destructive />
            </>
          )}
        </>
      )}
    </div>
  )
}
