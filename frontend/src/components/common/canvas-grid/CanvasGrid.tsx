/**
 * CanvasGrid — Canvas-based grid body renderer.
 *
 * Replaces the DOM-based TableBody rendering in DataTable with three
 * layered canvases (pinned, main, overlay) + a DOM overlay for cell editing.
 *
 * All existing hooks (useGridNavigation, useFillHandle, useCellDragMove,
 * useInlineEditing, useAutoScroll) are kept intact — this component only
 * handles the visual rendering and mouse event routing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CellFormat, EntryRow, Field } from '@/lib/types'
import type { CellPosition, SelectionRange } from '@/hooks/useGridNavigation'
import type { FillPreviewRange } from '@/hooks/useFillHandle'
import type { DragGhostRange } from '@/hooks/useCellDragMove'
import type { CellSaveState } from '@/hooks/useInlineEditing'
import { GridLayout, type GridLayoutConfig } from './GridLayout'
import { paintViewport, paintPinnedColumns } from './CellPainter'
import { paintOverlay } from './OverlayPainter'
import type { OverlayState } from './types'

import GridCell from '../GridCell'

// ─── Props ───────────────────────────────────────────────────────

export interface CanvasGridProps {
  // Data
  data: Record<string, unknown>[]
  columnIds: string[]
  fields: Field[]
  emptyRowCount: number

  // Layout from TanStack Table
  columnWidths: number[]
  rowSizing: Record<number, number>
  defaultRowHeight: number
  pinnedLeftCount: number
  headerHeight: number

  // Grid navigation state
  activeCell: CellPosition | null
  selection: SelectionRange | null

  // Visual overlay state
  copiedRange: SelectionRange | null
  fillPreview: FillPreviewRange | null
  dragGhost: DragGhostRange | null

  // Editing
  editingCell: CellPosition | null
  editValue: unknown
  onEditValueChange: (v: unknown) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onEditKeyDown: (e: React.KeyboardEvent) => void
  getFieldForCol: (colIdx: number) => Field | null
  cellSaveState?: Map<string, CellSaveState>

  // Cell formats
  cellFormats: (rowIdx: number, colId: string) => CellFormat | undefined
  cellDirtyFn?: (rowId: string, fieldSlug: string) => boolean
  cellErrorFn?: (rowId: string, fieldSlug: string) => string | null

  // Event handlers
  onCellClick: (row: number, col: number, e: React.MouseEvent) => void
  onCellDoubleClick: (row: number, col: number) => void
  onCellMouseDown: (row: number, col: number, e: React.MouseEvent) => void
  onCellMouseMove: (e: React.MouseEvent, row: number, col: number) => void
  onCellContextMenu: (e: React.MouseEvent, row: number, col: number) => void
  onFillHandleMouseDown: (e: React.MouseEvent) => void
  onFillHandleDoubleClick: (e: React.MouseEvent) => void
  onRowNumberMouseDown: (e: React.MouseEvent, row: number) => void

  // Pagination (for row number display)
  page: number
  limit: number

  // System columns to skip in text rendering
  systemColumns: Set<string>

  // Scroll container ref (shared with useAutoScroll)
  scrollRef: React.RefObject<HTMLDivElement | null>

  // GridLayout instance (shared with hooks for cellAtPoint)
  gridLayout: GridLayout
}

// ─── Component ───────────────────────────────────────────────────

export function CanvasGrid({
  data,
  columnIds,
  fields,
  emptyRowCount,
  columnWidths,
  rowSizing,
  defaultRowHeight,
  pinnedLeftCount,
  headerHeight,
  activeCell,
  selection,
  copiedRange,
  fillPreview,
  dragGhost,
  editingCell,
  editValue,
  onEditValueChange,
  onCommitEdit,
  onCancelEdit,
  onEditKeyDown,
  getFieldForCol,
  cellSaveState,
  cellFormats,
  cellDirtyFn,
  cellErrorFn,
  onCellClick,
  onCellDoubleClick,
  onCellMouseDown,
  onCellMouseMove,
  onCellContextMenu,
  onFillHandleMouseDown,
  onFillHandleDoubleClick,
  onRowNumberMouseDown,
  page,
  limit,
  systemColumns,
  scrollRef,
  gridLayout,
}: CanvasGridProps) {
  const pinnedCanvasRef = useRef<HTMLCanvasElement>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [fillHandleHovered, setFillHandleHovered] = useState(false)

  const dataRedrawPending = useRef(false)
  const overlayRedrawPending = useRef(false)
  const rafId = useRef(0)

  // Copy range marching ants animation
  const marchingAntsRafId = useRef(0)
  const timestampRef = useRef(0)

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const totalRows = data.length + emptyRowCount

  // ─── Canvas sizing ──────────────────────────────────────────

  const resizeCanvas = useCallback((canvas: HTMLCanvasElement | null, w: number, h: number) => {
    if (!canvas) return
    const cw = Math.round(w * dpr)
    const ch = Math.round(h * dpr)
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
  }, [dpr])

  // ─── Data canvas painting ───────────────────────────────────

  const paintData = useCallback(() => {
    const mainCtx = mainCanvasRef.current?.getContext('2d')
    const pinnedCtx = pinnedCanvasRef.current?.getContext('2d')
    if (!mainCtx || !pinnedCtx) return

    // Reset transform and apply DPR scale
    mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    pinnedCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const opts = {
      ctx: mainCtx,
      layout: gridLayout,
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
    }

    paintViewport(opts)
    paintPinnedColumns({ ...opts, ctx: pinnedCtx })
  }, [gridLayout, data, columnIds, fields, emptyRowCount, cellFormats, cellDirtyFn, cellErrorFn, cellSaveState, page, limit, systemColumns, pinnedLeftCount, dpr])

  // ─── Overlay canvas painting ────────────────────────────────

  const paintOverlayCanvas = useCallback(() => {
    const ctx = overlayCanvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const state: OverlayState = {
      activeCell,
      selection,
      copiedRange,
      fillPreview,
      dragGhost,
      hoveredRow,
      fillHandleHovered,
    }

    paintOverlay({
      ctx,
      layout: gridLayout,
      state,
      timestamp: timestampRef.current,
      totalColumns: columnIds.length,
    })
  }, [gridLayout, activeCell, selection, copiedRange, fillPreview, dragGhost, hoveredRow, fillHandleHovered, columnIds.length, dpr])

  // ─── Redraw scheduling ──────────────────────────────────────

  const scheduleRedraw = useCallback(() => {
    if (rafId.current) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0
      if (dataRedrawPending.current) {
        dataRedrawPending.current = false
        paintData()
      }
      if (overlayRedrawPending.current) {
        overlayRedrawPending.current = false
        paintOverlayCanvas()
      }
    })
  }, [paintData, paintOverlayCanvas])

  const requestDataRedraw = useCallback(() => {
    dataRedrawPending.current = true
    overlayRedrawPending.current = true // data change requires overlay repaint too
    scheduleRedraw()
  }, [scheduleRedraw])

  const requestOverlayRedraw = useCallback(() => {
    overlayRedrawPending.current = true
    scheduleRedraw()
  }, [scheduleRedraw])

  // ─── Marching ants animation loop ───────────────────────────

  useEffect(() => {
    if (!copiedRange) {
      if (marchingAntsRafId.current) {
        cancelAnimationFrame(marchingAntsRafId.current)
        marchingAntsRafId.current = 0
      }
      return
    }

    const animate = (time: number) => {
      timestampRef.current = time
      paintOverlayCanvas()
      marchingAntsRafId.current = requestAnimationFrame(animate)
    }
    marchingAntsRafId.current = requestAnimationFrame(animate)

    return () => {
      if (marchingAntsRafId.current) cancelAnimationFrame(marchingAntsRafId.current)
    }
  }, [copiedRange, paintOverlayCanvas])

  // ─── Resize observer ────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      resizeCanvas(mainCanvasRef.current, width, height)
      resizeCanvas(overlayCanvasRef.current, width, height)
      resizeCanvas(pinnedCanvasRef.current, gridLayout.pinnedWidth, height)
      requestDataRedraw()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [resizeCanvas, gridLayout.pinnedWidth, requestDataRedraw])

  // ─── Scroll handling ────────────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current
    const container = containerRef.current
    if (!el || !container) return

    const onScroll = () => {
      // Use CanvasGrid container rect (already offset past the header)
      // so cellAtPoint maps mouse coords correctly within the canvas area.
      const rect = container.getBoundingClientRect()
      gridLayout.update(el.scrollLeft, el.scrollTop, rect)
      requestDataRedraw()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    // Initial update
    onScroll()

    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef, gridLayout, requestDataRedraw])

  // ─── Redraw on data/state changes ───────────────────────────

  useEffect(() => { requestDataRedraw() }, [data, columnIds, fields, columnWidths, rowSizing, requestDataRedraw])
  useEffect(() => { requestOverlayRedraw() }, [activeCell, selection, fillPreview, dragGhost, hoveredRow, fillHandleHovered, requestOverlayRedraw])

  // ─── Mouse event routing ────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = gridLayout.cellAtPoint(e.clientX, e.clientY)
    if (!pos) {
      setHoveredRow(null)
      return
    }

    setHoveredRow(pos.row)

    // Check fill handle hover
    if (activeCell || selection) {
      let handleRow: number, handleCol: number
      if (selection) {
        const sel = { startRow: Math.min(selection.startRow, selection.endRow), endRow: Math.max(selection.startRow, selection.endRow), startCol: Math.min(selection.startCol, selection.endCol), endCol: Math.max(selection.startCol, selection.endCol) }
        handleRow = sel.endRow
        handleCol = sel.endCol
      } else {
        handleRow = activeCell!.row
        handleCol = activeCell!.col
      }
      const inFillZone = gridLayout.isInFillHandleZone(e.clientX, e.clientY, handleRow, handleCol)
      setFillHandleHovered(inFillZone)
      if (inFillZone) {
        (e.currentTarget as HTMLElement).style.cursor = 'crosshair'
        return
      }
    }

    // Delegate to cell drag move (for border detection / cursor)
    onCellMouseMove(e, pos.row, pos.col)
  }, [gridLayout, activeCell, selection, onCellMouseMove])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const pos = gridLayout.cellAtPoint(e.clientX, e.clientY)
    if (!pos) return

    const colId = columnIds[pos.col]

    // Row number click → row selection
    if (colId === '_rowNum') {
      onRowNumberMouseDown(e, pos.row)
      return
    }

    // Fill handle mousedown
    if (fillHandleHovered) {
      onFillHandleMouseDown(e)
      return
    }

    onCellMouseDown(pos.row, pos.col, e)
  }, [gridLayout, columnIds, fillHandleHovered, onCellMouseDown, onFillHandleMouseDown, onRowNumberMouseDown])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const pos = gridLayout.cellAtPoint(e.clientX, e.clientY)
    if (!pos) return
    onCellClick(pos.row, pos.col, e)
  }, [gridLayout, onCellClick])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const pos = gridLayout.cellAtPoint(e.clientX, e.clientY)
    if (!pos) return

    // Fill handle double-click
    if (fillHandleHovered) {
      onFillHandleDoubleClick(e)
      return
    }

    const colId = columnIds[pos.col]
    if (colId === '_rowNum' || systemColumns.has(colId)) return
    onCellDoubleClick(pos.row, pos.col)
  }, [gridLayout, columnIds, systemColumns, fillHandleHovered, onCellDoubleClick, onFillHandleDoubleClick])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const pos = gridLayout.cellAtPoint(e.clientX, e.clientY)
    if (!pos) return
    e.preventDefault()
    onCellContextMenu(e, pos.row, pos.col)
  }, [gridLayout, onCellContextMenu])

  const handleMouseLeave = useCallback(() => {
    setHoveredRow(null)
    setFillHandleHovered(false)
  }, [])

  // ─── Editing cell DOM overlay ───────────────────────────────

  const editingOverlay = (() => {
    if (!editingCell) return null
    const rect = gridLayout.cellRect(editingCell.row, editingCell.col)
    const field = getFieldForCol(editingCell.col)
    const entry = editingCell.row < data.length ? data[editingCell.row] as EntryRow : null
    const rowId = entry ? String(entry.id) : ''
    const colId = columnIds[editingCell.col]
    const saveState = cellSaveState?.get(`${rowId}:${colId}`) ?? null

    return (
      <div
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          zIndex: 20,
          background: '#fff',
          border: '2px solid #005a9e',
          boxSizing: 'border-box',
        }}
      >
        <GridCell
          field={field}
          value={entry ? entry[colId] : null}
          isEditing={true}
          editValue={editValue}
          onEditValueChange={onEditValueChange}
          onCommit={onCommitEdit}
          onCancel={onCancelEdit}
          onKeyDown={onEditKeyDown}
          saveState={saveState}
          displayContent={null}
        />
      </div>
    )
  })()

  // ─── Content sizing ─────────────────────────────────────────

  const contentWidth = gridLayout.totalContentWidth
  const contentHeight = gridLayout.totalContentHeight

  // ─── Render ─────────────────────────────────────────────────

  // CanvasGrid is placed as a sibling of scrollRef, absolutely positioned
  // over the same area. The header is inside scrollRef (sticky), so canvases
  // must offset by headerHeight + 1px border.
  const canvasTopOffset = headerHeight + 1 // +1 for scrollRef border-top

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: canvasTopOffset,
        left: 1, // border-left of scrollRef
        right: 1, // border-right
        bottom: 1, // border-bottom
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >

      {/* Main data canvas (scrollable area) */}
      <canvas
        ref={mainCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Pinned-left canvas (fixed horizontally, scrolls vertically) */}
      <canvas
        ref={pinnedCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Overlay canvas (selection, hover, fill handle, etc.) */}
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Transparent event capture layer */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 3,
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseLeave={handleMouseLeave}
      />

      {/* DOM overlay for editing cell */}
      {editingOverlay}
    </div>
  )
}
