/**
 * Pre-built selectors for common grid store subscriptions.
 *
 * Using fine-grained selectors avoids unnecessary re-renders — a cell that
 * only cares about `activeCell` won't re-render when `fillPreview` changes.
 */
import type { GridState } from './types'

// ── Navigation ───────────────────────────────────────────────────────
export const selectActiveCell = (s: GridState) => s.activeCell
export const selectSelection = (s: GridState) => s.selection

// ── Editing ──────────────────────────────────────────────────────────
export const selectEditingCell = (s: GridState) => s.editingCell
export const selectEditValue = (s: GridState) => s.editValue
export const selectIsEditing = (s: GridState) => s.editingCell !== null
export const selectCellSaveState = (s: GridState) => s.cellSaveState

// ── Fill ─────────────────────────────────────────────────────────────
export const selectFillPreview = (s: GridState) => s.fillPreview
export const selectFillDragging = (s: GridState) => s.fillDragging

// ── Drag-move ────────────────────────────────────────────────────────
export const selectDragGhost = (s: GridState) => s.dragGhost
export const selectDragMoveDragging = (s: GridState) => s.dragMoveDragging
