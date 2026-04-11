/**
 * Grid store shared types.
 *
 * These were originally defined in useGridNavigation.ts and are now the
 * canonical source.  The old module re-exports them for backward compat.
 */

// ── Cell / Selection primitives ──────────────────────────────────────

export interface CellPosition {
  row: number
  col: number
}

export interface SelectionRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/** Normalize selection range so start <= end. */
export function normalize(range: SelectionRange): SelectionRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endRow: Math.max(range.startRow, range.endRow),
    endCol: Math.max(range.startCol, range.endCol),
  }
}

export function isCellInRange(row: number, col: number, range: SelectionRange | null): boolean {
  if (!range) return false
  const n = normalize(range)
  return row >= n.startRow && row <= n.endRow && col >= n.startCol && col <= n.endCol
}

// ── Fill / Drag ghost ranges ─────────────────────────────────────────

export interface FillPreviewRange {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}

export interface DragGhostRange {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  mode: 'move' | 'copy'
}

// ── Cell save state (editing) ────────────────────────────────────────

export type CellSaveState = 'saving' | 'saved'

// ── Slice state shapes ───────────────────────────────────────────────

export interface NavigationSlice {
  activeCell: CellPosition | null
  selection: SelectionRange | null
}

export interface EditingSlice {
  editingCell: CellPosition | null
  editValue: unknown
  cellSaveState: Map<string, CellSaveState>
}

export interface FillSlice {
  fillPreview: FillPreviewRange | null
  fillDragging: boolean
}

export interface DragMoveSlice {
  dragGhost: DragGhostRange | null
  dragMoveDragging: boolean
}

// ── Actions ──────────────────────────────────────────────────────────

export interface NavigationActions {
  setActiveCell: (cell: CellPosition | null) => void
  setSelection: (range: SelectionRange | null) => void
}

export interface EditingActions {
  setEditingCell: (cell: CellPosition | null) => void
  setEditValue: (value: unknown) => void
  setCellSaveState: (next: Map<string, CellSaveState>) => void
  updateCellSaveState: (key: string, value: CellSaveState | null) => void
}

export interface FillActions {
  setFillPreview: (range: FillPreviewRange | null) => void
  setFillDragging: (dragging: boolean) => void
}

export interface DragMoveActions {
  setDragGhost: (range: DragGhostRange | null) => void
  setDragMoveDragging: (dragging: boolean) => void
}

// ── Combined store type ──────────────────────────────────────────────

export type GridState =
  NavigationSlice & NavigationActions &
  EditingSlice & EditingActions &
  FillSlice & FillActions &
  DragMoveSlice & DragMoveActions & {
    /** Reset all state (e.g. on unmount or sheet change). */
    reset: () => void
  }
