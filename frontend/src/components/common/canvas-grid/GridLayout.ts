import type { CellAtPointFn, CellRect, IsNearBorderFn } from './types'

const EDGE_THRESHOLD = 6
const FILL_HANDLE_SIZE = 10

export interface GridLayoutConfig {
  /** Width of each column in CSS pixels, ordered by visual index. */
  columnWidths: number[]
  /** Row height callback (index → height in CSS px). */
  rowHeight: (index: number) => number
  /** Default row height when rowHeight returns undefined. */
  defaultRowHeight: number
  /** Total number of rows (data + empty). */
  totalRows: number
  /** Number of left-pinned columns (including _rowNum). */
  pinnedLeftCount: number
  /** Header height in CSS pixels. */
  headerHeight: number
}

/**
 * GridLayout — pure coordinate math for the canvas grid.
 *
 * Converts viewport coordinates to cell positions, computes cell rectangles,
 * and detects proximity to cell borders. No React dependency — can be tested
 * in isolation.
 *
 * Usage:
 *   const layout = new GridLayout(config)
 *   layout.update(scrollLeft, scrollTop, containerRect)
 *   const cell = layout.cellAtPoint(clientX, clientY)
 */
export class GridLayout {
  private colWidths: number[] = []
  private colOffsets: number[] = [] // cumulative left offsets
  private totalWidth = 0
  private _rowHeight: (index: number) => number = () => 20
  private defaultRowH = 20
  private _totalRows = 0
  private pinnedLeftCount = 0
  private pinnedLeftWidth = 0
  private headerHeight = 20

  // Scroll state — updated on every scroll event
  private scrollLeft = 0
  private scrollTop = 0
  private containerLeft = 0
  private containerTop = 0
  private viewportWidth = 0
  private viewportHeight = 0

  // Row offset cache for variable row heights
  private rowOffsetCache: number[] = []
  private rowOffsetCacheValid = false

  constructor(config: GridLayoutConfig) {
    this.configure(config)
  }

  /** Reconfigure column widths, row count, etc. (e.g. after column resize). */
  configure(config: GridLayoutConfig): void {
    this.colWidths = config.columnWidths
    this._rowHeight = config.rowHeight
    this.defaultRowH = config.defaultRowHeight
    this._totalRows = config.totalRows
    this.pinnedLeftCount = config.pinnedLeftCount
    this.headerHeight = config.headerHeight

    // Precompute cumulative column offsets
    this.colOffsets = new Array(this.colWidths.length)
    let acc = 0
    for (let i = 0; i < this.colWidths.length; i++) {
      this.colOffsets[i] = acc
      acc += this.colWidths[i]
    }
    this.totalWidth = acc

    // Pinned left width
    this.pinnedLeftWidth = 0
    for (let i = 0; i < Math.min(this.pinnedLeftCount, this.colWidths.length); i++) {
      this.pinnedLeftWidth += this.colWidths[i]
    }

    this.rowOffsetCacheValid = false
  }

  /** Update scroll position and container bounds (call on every scroll event). */
  update(scrollLeft: number, scrollTop: number, containerRect: DOMRect): void {
    this.scrollLeft = scrollLeft
    this.scrollTop = scrollTop
    this.containerLeft = containerRect.left
    this.containerTop = containerRect.top
    this.viewportWidth = containerRect.width
    this.viewportHeight = containerRect.height
  }

  // ─── Row offset computation ─────────────────────────────────────

  private getRowHeight(index: number): number {
    return this._rowHeight(index) || this.defaultRowH
  }

  private ensureRowOffsets(): void {
    if (this.rowOffsetCacheValid) return
    this.rowOffsetCache = new Array(this._totalRows + 1)
    let acc = 0
    for (let i = 0; i <= this._totalRows; i++) {
      this.rowOffsetCache[i] = acc
      if (i < this._totalRows) acc += this.getRowHeight(i)
    }
    this.rowOffsetCacheValid = true
  }

  /** Invalidate row offset cache (call when rowSizing changes). */
  invalidateRowOffsets(): void {
    this.rowOffsetCacheValid = false
  }

  private rowTop(index: number): number {
    this.ensureRowOffsets()
    return this.rowOffsetCache[index] ?? 0
  }

  get totalContentHeight(): number {
    this.ensureRowOffsets()
    return this.rowOffsetCache[this._totalRows] ?? 0
  }

  get totalContentWidth(): number {
    return this.totalWidth
  }

  get totalRows(): number {
    return this._totalRows
  }

  get colCount(): number {
    return this.colWidths.length
  }

  // ─── Core lookups ───────────────────────────────────────────────

  /**
   * Resolve viewport coordinates (clientX, clientY) to a grid cell.
   * Returns null if the point is outside the grid body.
   */
  cellAtPoint: CellAtPointFn = (clientX, clientY) => {
    // Convert client coords to content coords.
    // containerTop already points to the top of the CanvasGrid (below the header),
    // so no headerHeight offset is needed here.
    const contentY = clientY - this.containerTop + this.scrollTop
    const row = this.rowAtContentY(contentY)
    if (row === null) return null

    // Is the point in the pinned-left region?
    const relX = clientX - this.containerLeft
    if (relX < this.pinnedLeftWidth) {
      const col = this.colAtContentX(relX) // pinned cols don't scroll
      return col !== null ? { row, col } : null
    }

    // Scrollable region: convert viewport-relative X to absolute content X.
    // relX already includes the pinned region visually; adding scrollLeft
    // accounts for the hidden scrolled-away portion.
    const contentX = relX + this.scrollLeft
    const col = this.colAtContentX(contentX)
    return col !== null ? { row, col } : null
  }

  /** Resolve content Y coordinate to a row index. */
  private rowAtContentY(contentY: number): number | null {
    if (contentY < 0 || this._totalRows === 0) return null
    this.ensureRowOffsets()
    // Binary search
    let lo = 0
    let hi = this._totalRows - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const top = this.rowOffsetCache[mid]
      const bottom = this.rowOffsetCache[mid + 1]
      if (contentY < top) {
        hi = mid - 1
      } else if (contentY >= bottom) {
        lo = mid + 1
      } else {
        return mid
      }
    }
    return null
  }

  /** Resolve content X coordinate to a column index. */
  private colAtContentX(contentX: number): number | null {
    if (contentX < 0 || this.colWidths.length === 0) return null
    // Binary search on colOffsets
    let lo = 0
    let hi = this.colWidths.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const left = this.colOffsets[mid]
      const right = left + this.colWidths[mid]
      if (contentX < left) {
        hi = mid - 1
      } else if (contentX >= right) {
        lo = mid + 1
      } else {
        return mid
      }
    }
    return null
  }

  /** Row index at a given client Y coordinate. */
  rowAtClientY(clientY: number): number | null {
    const contentY = clientY - this.containerTop + this.scrollTop
    return this.rowAtContentY(contentY)
  }

  // ─── Bounding rectangles ───────────────────────────────────────

  /**
   * Get a cell's rectangle in CSS pixels, relative to the scroll container's
   * top-left corner (suitable for positioning absolute DOM overlays).
   */
  cellRect(row: number, col: number): CellRect {
    const y = this.rowTop(row) - this.scrollTop
    const width = this.colWidths[col] ?? 0
    const height = this.getRowHeight(row)

    // X position depends on whether the column is pinned
    let x: number
    if (col < this.pinnedLeftCount) {
      x = this.colOffsets[col]
    } else {
      x = this.colOffsets[col] - this.scrollLeft
    }

    return { x, y, width, height }
  }

  /**
   * Get a cell's rectangle in content coordinates (for canvas drawing).
   * X and Y are relative to the full content area, not the viewport.
   */
  cellContentRect(row: number, col: number): CellRect {
    return {
      x: this.colOffsets[col],
      y: this.rowTop(row),
      width: this.colWidths[col] ?? 0,
      height: this.getRowHeight(row),
    }
  }

  /** Column width by index. */
  colWidth(col: number): number {
    return this.colWidths[col] ?? 0
  }

  /** Column left offset in content coordinates. */
  colLeft(col: number): number {
    return this.colOffsets[col] ?? 0
  }

  /** Get pinned left width. */
  get pinnedWidth(): number {
    return this.pinnedLeftWidth
  }

  /** Get pinned left column count. */
  get pinnedCount(): number {
    return this.pinnedLeftCount
  }

  // ─── Viewport range ────────────────────────────────────────────

  /** Range of row indices visible in the viewport (inclusive). */
  visibleRowRange(): { start: number; end: number } {
    const startY = this.scrollTop
    const endY = this.scrollTop + this.viewportHeight

    const start = this.rowAtContentY(startY) ?? 0
    let end = this.rowAtContentY(endY) ?? this._totalRows - 1
    end = Math.min(end, this._totalRows - 1)

    return { start, end }
  }

  /** Range of column indices visible in the scrollable (non-pinned) viewport. */
  visibleColRange(): { start: number; end: number } {
    const startX = this.scrollLeft + this.pinnedLeftWidth
    const endX = startX + this.viewportWidth - this.pinnedLeftWidth

    let start = this.pinnedLeftCount
    for (let i = this.pinnedLeftCount; i < this.colWidths.length; i++) {
      if (this.colOffsets[i] + this.colWidths[i] > startX) {
        start = i
        break
      }
    }

    let end = this.colWidths.length - 1
    for (let i = start; i < this.colWidths.length; i++) {
      if (this.colOffsets[i] > endX) {
        end = i - 1
        break
      }
    }

    return { start, end: Math.max(start, end) }
  }

  // ─── Border / fill-handle detection ────────────────────────────

  /**
   * Check if a viewport point is near the border of the given cell.
   * Replaces the DOM-based isNearBorder in useCellDragMove.
   */
  isNearCellBorder: IsNearBorderFn = (clientX, clientY, row, col) => {
    const rect = this.cellRect(row, col)
    const x = clientX - this.containerLeft - rect.x
    const y = clientY - this.containerTop - rect.y
    const w = rect.width
    const h = rect.height

    // Exclude fill-handle corner (bottom-right)
    if (x >= w - FILL_HANDLE_SIZE && y >= h - FILL_HANDLE_SIZE) return false

    return x < EDGE_THRESHOLD || x > w - EDGE_THRESHOLD ||
           y < EDGE_THRESHOLD || y > h - EDGE_THRESHOLD
  }

  /** Check if a viewport point is in the fill handle zone (bottom-right 7×7 area). */
  isInFillHandleZone(clientX: number, clientY: number, row: number, col: number): boolean {
    const rect = this.cellRect(row, col)
    const x = clientX - this.containerLeft - rect.x
    const y = clientY - this.containerTop - rect.y
    const HANDLE = 7
    return x >= rect.width - HANDLE && y >= rect.height - HANDLE
  }

  // ─── Scroll info (for useAutoScroll compatibility) ─────────────

  get currentScrollLeft(): number { return this.scrollLeft }
  get currentScrollTop(): number { return this.scrollTop }
  get currentViewportWidth(): number { return this.viewportWidth }
  get currentViewportHeight(): number { return this.viewportHeight }
  get currentHeaderHeight(): number { return this.headerHeight }
}
