/**
 * OverlayPainter — draws interactive state overlays on a transparent canvas.
 *
 * Renders selection highlights, active cell border, fill handle, fill preview,
 * drag ghost, copy range marching ants, and hovered row highlight.
 *
 * Separated from CellPainter so that selection/hover changes only repaint
 * this lightweight overlay layer, not the full data canvas.
 */
import { normalize } from '@/hooks/useGridNavigation'
import type { GridLayout } from './GridLayout'
import type { OverlayState } from './types'

// ─── Colors ──────────────────────────────────────────────────────

const SELECTION_BG = '#cce4f7'
const SELECTION_BORDER = '#005a9e'
const HOVER_ROW_BG = 'rgba(214, 228, 240, 0.3)'
const FILL_HANDLE_COLOR = '#005a9e'
const FILL_PREVIEW_BG = '#cce4f7'
const DRAG_GHOST_BG = 'rgba(0, 0, 0, 0.04)'
const DRAG_GHOST_MOVE_BORDER = '#666666'
const DRAG_GHOST_COPY_BORDER = '#005a9e'

// ─── Helpers ─────────────────────────────────────────────────────

interface NormalizedRange {
  r1: number
  r2: number
  c1: number
  c2: number
}

function rangeRect(layout: GridLayout, range: NormalizedRange) {
  const tl = layout.cellContentRect(range.r1, range.c1)
  const br = layout.cellContentRect(range.r2, range.c2)
  return {
    x: tl.x,
    y: tl.y,
    width: br.x + br.width - tl.x,
    height: br.y + br.height - tl.y,
  }
}

function drawDashedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  dash: number[],
  lineWidth: number,
  color: string,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.setLineDash(dash)
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
}

// ─── Main paint function ─────────────────────────────────────────

export interface PaintOverlayOptions {
  ctx: CanvasRenderingContext2D
  layout: GridLayout
  state: OverlayState
  /** Current time in ms (for marching ants animation). */
  timestamp: number
  /** Columns count to determine full-width hover row. */
  totalColumns: number
}

/**
 * Paint all overlay elements. Called on every selection/hover/animation change.
 * The canvas should be transparent — only overlay visuals are drawn.
 */
export function paintOverlay({
  ctx,
  layout,
  state,
  timestamp,
  totalColumns,
}: PaintOverlayOptions): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  ctx.save()
  ctx.translate(-layout.currentScrollLeft, -layout.currentScrollTop)

  // ─── 1. Hovered row highlight ────────────────────────────────

  if (state.hoveredRow !== null) {
    const rowRect = layout.cellContentRect(state.hoveredRow, 0)
    const lastCol = totalColumns - 1
    const endRect = layout.cellContentRect(state.hoveredRow, lastCol)
    ctx.fillStyle = HOVER_ROW_BG
    ctx.fillRect(rowRect.x, rowRect.y, endRect.x + endRect.width - rowRect.x, rowRect.height)
  }

  // ─── 2. Selection background (excluding active cell) ─────────

  if (state.selection) {
    const sel = normalize(state.selection)
    const norm: NormalizedRange = { r1: sel.startRow, r2: sel.endRow, c1: sel.startCol, c2: sel.endCol }
    ctx.fillStyle = SELECTION_BG
    for (let r = norm.r1; r <= norm.r2; r++) {
      for (let c = norm.c1; c <= norm.c2; c++) {
        // Skip active cell (it gets a border, not a fill)
        if (state.activeCell && r === state.activeCell.row && c === state.activeCell.col) continue
        const rect = layout.cellContentRect(r, c)
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      }
    }
  }

  // ─── 3. Fill preview background ──────────────────────────────

  if (state.fillPreview) {
    const fp = state.fillPreview
    ctx.fillStyle = FILL_PREVIEW_BG
    for (let r = fp.startRow; r <= fp.endRow; r++) {
      for (let c = fp.startCol; c <= fp.endCol; c++) {
        const rect = layout.cellContentRect(r, c)
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      }
    }
  }

  // ─── 4. Drag ghost background ────────────────────────────────

  if (state.dragGhost) {
    const dg = state.dragGhost
    ctx.fillStyle = DRAG_GHOST_BG
    for (let r = dg.startRow; r <= dg.endRow; r++) {
      for (let c = dg.startCol; c <= dg.endCol; c++) {
        const rect = layout.cellContentRect(r, c)
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      }
    }
  }

  // ─── 5. Selection edge border ────────────────────────────────

  if (state.selection) {
    const sel = normalize(state.selection)
    const norm: NormalizedRange = { r1: sel.startRow, r2: sel.endRow, c1: sel.startCol, c2: sel.endCol }
    const r = rangeRect(layout, norm)
    ctx.strokeStyle = SELECTION_BORDER
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.strokeRect(r.x, r.y, r.width, r.height)
  }

  // ─── 6. Active cell border ───────────────────────────────────

  if (state.activeCell) {
    const rect = layout.cellContentRect(state.activeCell.row, state.activeCell.col)
    ctx.strokeStyle = SELECTION_BORDER
    ctx.lineWidth = 2
    ctx.setLineDash([])
    // Inset -1px to match the CSS ::after behavior
    ctx.strokeRect(rect.x - 1, rect.y - 1, rect.width + 2, rect.height + 2)
  }

  // ─── 7. Fill preview dashed border ───────────────────────────

  if (state.fillPreview) {
    const fp = state.fillPreview
    const norm: NormalizedRange = { r1: fp.startRow, r2: fp.endRow, c1: fp.startCol, c2: fp.endCol }
    const r = rangeRect(layout, norm)
    drawDashedRect(ctx, r.x, r.y, r.width, r.height, [4, 4], 2, SELECTION_BORDER)
  }

  // ─── 8. Drag ghost dashed border ─────────────────────────────

  if (state.dragGhost) {
    const dg = state.dragGhost
    const norm: NormalizedRange = { r1: dg.startRow, r2: dg.endRow, c1: dg.startCol, c2: dg.endCol }
    const r = rangeRect(layout, norm)
    const color = dg.mode === 'copy' ? DRAG_GHOST_COPY_BORDER : DRAG_GHOST_MOVE_BORDER
    drawDashedRect(ctx, r.x, r.y, r.width, r.height, [4, 4], 2, color)
  }

  // ─── 9. Copy range marching ants ─────────────────────────────

  if (state.copiedRange) {
    const sel = normalize(state.copiedRange)
    const norm: NormalizedRange = { r1: sel.startRow, r2: sel.endRow, c1: sel.startCol, c2: sel.endCol }
    const r = rangeRect(layout, norm)

    // Blink effect: visible for 500ms, hidden for 500ms
    const visible = Math.floor(timestamp / 500) % 2 === 0
    if (visible) {
      ctx.strokeStyle = SELECTION_BORDER
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.lineDashOffset = -(timestamp / 50) % 10 // Animate dash offset
      ctx.strokeRect(r.x, r.y, r.width, r.height)
      ctx.setLineDash([])
      ctx.lineDashOffset = 0
    }
  }

  // ─── 10. Fill handle ─────────────────────────────────────────

  if (state.activeCell || state.selection) {
    // Position at bottom-right of selection or active cell
    let handleRow: number
    let handleCol: number
    if (state.selection) {
      const sel = normalize(state.selection)
      handleRow = sel.endRow
      handleCol = sel.endCol
    } else {
      handleRow = state.activeCell!.row
      handleCol = state.activeCell!.col
    }

    const rect = layout.cellContentRect(handleRow, handleCol)
    const size = state.fillHandleHovered ? 9 : 7
    const halfSize = Math.floor(size / 2)

    ctx.fillStyle = FILL_HANDLE_COLOR
    ctx.fillRect(
      rect.x + rect.width - halfSize - 1,
      rect.y + rect.height - halfSize - 1,
      size,
      size,
    )
  }

  ctx.restore()
}
