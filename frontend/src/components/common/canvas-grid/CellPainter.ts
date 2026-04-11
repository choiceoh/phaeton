/**
 * CellPainter — stateless functions for drawing grid cells onto a Canvas2D context.
 *
 * Renders cell text, backgrounds, grid lines, cell formats (bold/italic/color),
 * row numbers, dirty indicators, and error indicators.
 *
 * Uses formatCell() for text content — always a string, never JSX.
 */
import { formatCell } from '@/lib/formatCell'
import type { CellFormat, EntryRow, Field } from '@/lib/types'
import type { CellSaveState } from '@/hooks/useInlineEditing'
import type { GridLayout } from './GridLayout'

// ─── Constants ───────────────────────────────────────────────────

const GRID_LINE_COLOR = '#d4d4d4'
const ROW_NUM_BG = '#e6e6e6'
const ROW_NUM_TEXT = '#a3a3a3' // stone-400
const PINNED_BG = '#ffffff'
const PINNED_BORDER_COLOR = '#b0b0b0'
const DIRTY_TRIANGLE_COLOR = '#3b82f6' // blue-500
const ERROR_BG = 'rgba(254, 226, 226, 0.6)'
const ERROR_BORDER = 'rgba(239, 68, 68, 0.5)'

const CELL_PAD_X = 4  // px-1 = 4px
const CELL_PAD_Y = 0

const DEFAULT_FONT = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
const ROW_NUM_FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'

// ─── Text measurement cache ──────────────────────────────────────

const textWidthCache = new Map<string, number>()
const MAX_CACHE_SIZE = 5000

function measureText(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  const key = `${font}|${text}`
  let w = textWidthCache.get(key)
  if (w !== undefined) return w
  ctx.font = font
  w = ctx.measureText(text).width
  if (textWidthCache.size > MAX_CACHE_SIZE) textWidthCache.clear()
  textWidthCache.set(key, w)
  return w
}

/** Clear the text measurement cache (call on font/DPR change). */
export function clearTextCache(): void {
  textWidthCache.clear()
}

// ─── Cell font builder ───────────────────────────────────────────

function buildFont(fmt?: CellFormat): string {
  if (!fmt) return DEFAULT_FONT
  const size = fmt.fontSize ?? 12
  const weight = fmt.bold ? '600' : '400'
  const style = fmt.italic ? 'italic' : 'normal'
  return `${style} ${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`
}

// ─── Ellipsis text drawing ───────────────────────────────────────

function drawClippedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: string,
): void {
  if (maxWidth <= 0 || !text) return
  const tw = measureText(ctx, text, font)
  ctx.font = font
  if (tw <= maxWidth) {
    ctx.fillText(text, x, y)
    return
  }
  // Binary search for truncation point
  const ellipsis = '...'
  const ew = measureText(ctx, ellipsis, font)
  if (maxWidth <= ew) {
    ctx.fillText(ellipsis, x, y)
    return
  }
  const available = maxWidth - ew
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    const w = measureText(ctx, text.slice(0, mid), font)
    if (w <= available) lo = mid
    else hi = mid - 1
  }
  ctx.fillText(text.slice(0, lo) + ellipsis, x, y)
}

// ─── Main painting functions ─────────────────────────────────────

export interface PaintViewportOptions {
  ctx: CanvasRenderingContext2D
  layout: GridLayout
  data: Record<string, unknown>[]
  columnIds: string[]
  fields: Field[]
  emptyRowCount: number
  cellFormats: (rowIdx: number, colId: string) => CellFormat | undefined
  cellDirtyFn?: (rowId: string, fieldSlug: string) => boolean
  cellErrorFn?: (rowId: string, fieldSlug: string) => string | null
  cellSaveState?: Map<string, CellSaveState>
  page: number
  limit: number
  /** Set of column IDs that are system columns (_select, _actions, _status, created_at). */
  systemColumns: Set<string>
  /** Number of pinned-left columns (including _rowNum). */
  pinnedLeftCount: number
}

/**
 * Paint all visible cells in the viewport onto the given canvas context.
 * Assumes the context has already been scaled for DPR.
 */
export function paintViewport({
  ctx,
  layout,
  data,
  columnIds,
  fields,
  emptyRowCount,
  cellFormats,
  cellDirtyFn,
  cellErrorFn,
  cellSaveState,
  page,
  limit,
  systemColumns,
  pinnedLeftCount,
}: PaintViewportOptions): void {
  const { start: rowStart, end: rowEnd } = layout.visibleRowRange()
  const { start: colStart, end: colEnd } = layout.visibleColRange()
  const totalDataRows = data.length
  const fieldMap = new Map(fields.map(f => [f.slug, f]))

  // Clear canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // Draw in content coordinate space, translated by scroll offset
  ctx.save()
  ctx.translate(-layout.currentScrollLeft, -layout.currentScrollTop)

  // ─── Pass 1: Cell backgrounds ──────────────────────────────────

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const rect = layout.cellContentRect(row, col)
      const colId = columnIds[col]
      const isRowNum = colId === '_rowNum'
      const isPinned = col < pinnedLeftCount

      // Row number column background
      if (isRowNum) {
        ctx.fillStyle = ROW_NUM_BG
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
        continue
      }

      // Pinned column background (white to hide scrolling content beneath)
      if (isPinned) {
        ctx.fillStyle = PINNED_BG
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      }

      // Cell format background
      if (row < totalDataRows) {
        const fmt = cellFormats(row, colId)
        if (fmt?.bg) {
          ctx.fillStyle = fmt.bg
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
        }

        // Error background
        const entry = data[row] as EntryRow
        const rowId = String(entry.id)
        const error = cellErrorFn?.(rowId, colId)
        if (error) {
          ctx.fillStyle = ERROR_BG
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
          // Error inset border
          ctx.strokeStyle = ERROR_BORDER
          ctx.lineWidth = 1
          ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
        }
      }
    }
  }

  // Also paint pinned columns (col 0..pinnedLeftCount-1) that may not be in colStart..colEnd
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = 0; col < Math.min(pinnedLeftCount, colStart); col++) {
      const rect = layout.cellContentRect(row, col)
      const colId = columnIds[col]
      if (colId === '_rowNum') {
        ctx.fillStyle = ROW_NUM_BG
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      } else {
        ctx.fillStyle = PINNED_BG
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
        if (row < totalDataRows) {
          const fmt = cellFormats(row, colId)
          if (fmt?.bg) {
            ctx.fillStyle = fmt.bg
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
          }
        }
      }
    }
  }

  // ─── Pass 2: Grid lines ────────────────────────────────────────

  ctx.strokeStyle = GRID_LINE_COLOR
  ctx.lineWidth = 1

  // Horizontal lines
  ctx.beginPath()
  const xStart = layout.colLeft(0)
  const xEnd = layout.colLeft(layout.colCount - 1) + layout.colWidth(layout.colCount - 1)
  for (let row = rowStart; row <= rowEnd + 1; row++) {
    const y = layout.cellContentRect(row, 0).y
    ctx.moveTo(xStart, Math.round(y) + 0.5)
    ctx.lineTo(xEnd, Math.round(y) + 0.5)
  }
  ctx.stroke()

  // Vertical lines
  ctx.beginPath()
  const yStart = layout.cellContentRect(rowStart, 0).y
  const yEnd = layout.cellContentRect(rowEnd, 0).y + layout.cellContentRect(rowEnd, 0).height

  // Pinned columns
  for (let col = 0; col < pinnedLeftCount; col++) {
    const x = layout.colLeft(col) + layout.colWidth(col)
    ctx.moveTo(Math.round(x) + 0.5, yStart)
    ctx.lineTo(Math.round(x) + 0.5, yEnd)
  }
  // Scrollable columns
  for (let col = colStart; col <= colEnd + 1; col++) {
    if (col >= layout.colCount) break
    const x = layout.colLeft(col)
    ctx.moveTo(Math.round(x) + 0.5, yStart)
    ctx.lineTo(Math.round(x) + 0.5, yEnd)
  }
  ctx.stroke()

  // Pinned border (thick divider)
  if (pinnedLeftCount > 0) {
    const lastPinnedCol = pinnedLeftCount - 1
    const x = layout.colLeft(lastPinnedCol) + layout.colWidth(lastPinnedCol)
    ctx.strokeStyle = PINNED_BORDER_COLOR
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(Math.round(x), yStart)
    ctx.lineTo(Math.round(x), yEnd)
    ctx.stroke()
    ctx.strokeStyle = GRID_LINE_COLOR
    ctx.lineWidth = 1
  }

  // ─── Pass 3: Cell text ─────────────────────────────────────────

  ctx.textBaseline = 'middle'

  const paintCellText = (row: number, col: number) => {
    const rect = layout.cellContentRect(row, col)
    const colId = columnIds[col]
    const isRowNum = colId === '_rowNum'
    const isSystem = systemColumns.has(colId)
    const isEmptyRow = row >= totalDataRows

    if (isSystem && !isRowNum) return // Skip system columns (no text)

    // Row number
    if (isRowNum) {
      const rowNum = (page - 1) * limit + row + 1
      ctx.fillStyle = ROW_NUM_TEXT
      ctx.font = ROW_NUM_FONT
      ctx.textAlign = 'center'
      ctx.fillText(
        String(rowNum),
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      )
      ctx.textAlign = 'left'
      return
    }

    if (isEmptyRow) return // Empty rows show nothing

    // Data cell text
    const entry = data[row] as EntryRow
    const field = fieldMap.get(colId)
    if (!field) return

    const value = entry[colId]
    const text = formatCell(value, field)
    if (!text || text === '-') {
      // Draw dash in muted color
      if (text === '-') {
        ctx.fillStyle = '#a3a3a3'
        const font = DEFAULT_FONT
        ctx.font = font
        drawClippedText(ctx, '-', rect.x + CELL_PAD_X, rect.y + rect.height / 2, rect.width - CELL_PAD_X * 2, font)
      }
      return
    }

    const fmt = cellFormats(row, colId)
    const font = buildFont(fmt)
    ctx.fillStyle = fmt?.color ?? '#09090b' // foreground
    drawClippedText(ctx, text, rect.x + CELL_PAD_X, rect.y + rect.height / 2, rect.width - CELL_PAD_X * 2, font)
  }

  // Paint pinned columns
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = 0; col < pinnedLeftCount; col++) {
      paintCellText(row, col)
    }
  }

  // Paint scrollable columns
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      paintCellText(row, col)
    }
  }

  // ─── Pass 4: Dirty indicators ──────────────────────────────────

  if (cellDirtyFn) {
    ctx.fillStyle = DIRTY_TRIANGLE_COLOR
    for (let row = rowStart; row <= rowEnd; row++) {
      if (row >= totalDataRows) continue
      const entry = data[row] as EntryRow
      const rowId = String(entry.id)
      for (let col = colStart; col <= colEnd; col++) {
        const colId = columnIds[col]
        if (colId === '_rowNum' || systemColumns.has(colId)) continue
        if (cellDirtyFn(rowId, colId)) {
          const rect = layout.cellContentRect(row, col)
          ctx.beginPath()
          ctx.moveTo(rect.x, rect.y)
          ctx.lineTo(rect.x + 5, rect.y)
          ctx.lineTo(rect.x, rect.y + 5)
          ctx.closePath()
          ctx.fill()
        }
      }
    }
  }

  ctx.restore()
}

/**
 * Paint the pinned-left columns onto a separate canvas.
 * This canvas is positioned fixed horizontally and scrolls vertically.
 */
export function paintPinnedColumns({
  ctx,
  layout,
  data,
  columnIds,
  fields,
  emptyRowCount,
  cellFormats,
  cellDirtyFn,
  cellErrorFn,
  cellSaveState,
  page,
  limit,
  systemColumns,
  pinnedLeftCount,
}: PaintViewportOptions): void {
  if (pinnedLeftCount <= 0) return

  const { start: rowStart, end: rowEnd } = layout.visibleRowRange()
  const totalDataRows = data.length
  const fieldMap = new Map(fields.map(f => [f.slug, f]))

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  ctx.save()
  ctx.translate(0, -layout.currentScrollTop)

  // Backgrounds
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = 0; col < pinnedLeftCount; col++) {
      const rect = layout.cellContentRect(row, col)
      const colId = columnIds[col]

      if (colId === '_rowNum') {
        ctx.fillStyle = ROW_NUM_BG
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      } else {
        ctx.fillStyle = PINNED_BG
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
        if (row < totalDataRows) {
          const fmt = cellFormats(row, colId)
          if (fmt?.bg) {
            ctx.fillStyle = fmt.bg
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
          }
        }
      }
    }
  }

  // Grid lines
  ctx.strokeStyle = GRID_LINE_COLOR
  ctx.lineWidth = 1
  const xEnd = layout.colLeft(pinnedLeftCount - 1) + layout.colWidth(pinnedLeftCount - 1)

  // Horizontal
  ctx.beginPath()
  for (let row = rowStart; row <= rowEnd + 1; row++) {
    const y = layout.cellContentRect(row, 0).y
    ctx.moveTo(0, Math.round(y) + 0.5)
    ctx.lineTo(xEnd, Math.round(y) + 0.5)
  }
  ctx.stroke()

  // Vertical
  ctx.beginPath()
  const yStart = layout.cellContentRect(rowStart, 0).y
  const yEnd = layout.cellContentRect(rowEnd, 0).y + layout.cellContentRect(rowEnd, 0).height
  for (let col = 0; col <= pinnedLeftCount; col++) {
    const x = col < layout.colCount ? layout.colLeft(col) : xEnd
    ctx.moveTo(Math.round(x) + 0.5, yStart)
    ctx.lineTo(Math.round(x) + 0.5, yEnd)
  }
  ctx.stroke()

  // Pinned border divider
  ctx.strokeStyle = PINNED_BORDER_COLOR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(Math.round(xEnd), yStart)
  ctx.lineTo(Math.round(xEnd), yEnd)
  ctx.stroke()

  // Text
  ctx.textBaseline = 'middle'
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = 0; col < pinnedLeftCount; col++) {
      const rect = layout.cellContentRect(row, col)
      const colId = columnIds[col]

      if (colId === '_rowNum') {
        const rowNum = (page - 1) * limit + row + 1
        ctx.fillStyle = ROW_NUM_TEXT
        ctx.font = ROW_NUM_FONT
        ctx.textAlign = 'center'
        ctx.fillText(String(rowNum), rect.x + rect.width / 2, rect.y + rect.height / 2)
        ctx.textAlign = 'left'
        continue
      }

      if (row >= totalDataRows) continue

      const entry = data[row] as EntryRow
      const field = fieldMap.get(colId)
      if (!field) continue

      const value = entry[colId]
      const text = formatCell(value, field)
      if (!text) continue

      const fmt = cellFormats(row, colId)
      const font = buildFont(fmt)
      ctx.fillStyle = text === '-' ? '#a3a3a3' : (fmt?.color ?? '#09090b')
      drawClippedText(ctx, text, rect.x + CELL_PAD_X, rect.y + rect.height / 2, rect.width - CELL_PAD_X * 2, font)
    }
  }

  ctx.restore()
}
