import type { CellPosition, SelectionRange } from '@/hooks/useGridNavigation'
import type { FillPreviewRange } from '@/hooks/useFillHandle'
import type { DragGhostRange } from '@/hooks/useCellDragMove'

export type { CellPosition, SelectionRange, FillPreviewRange, DragGhostRange }

/** Function that resolves viewport coordinates to a grid cell position. */
export type CellAtPointFn = (clientX: number, clientY: number) => CellPosition | null

/** Function that checks if a point is near a cell border (for drag-move detection). */
export type IsNearBorderFn = (clientX: number, clientY: number, row: number, col: number) => boolean

/** Overlay visual state for the overlay canvas painter. */
export interface OverlayState {
  activeCell: CellPosition | null
  selection: SelectionRange | null
  copiedRange: SelectionRange | null
  fillPreview: FillPreviewRange | null
  dragGhost: DragGhostRange | null
  hoveredRow: number | null
  fillHandleHovered: boolean
}

/** Rectangle in CSS pixels relative to the scroll container's content area. */
export interface CellRect {
  x: number
  y: number
  width: number
  height: number
}
