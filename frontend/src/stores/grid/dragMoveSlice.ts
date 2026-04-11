import type { StateCreator } from 'zustand'
import type { GridState, DragGhostRange, DragMoveSlice, DragMoveActions } from './types'

export const createDragMoveSlice: StateCreator<
  GridState,
  [['zustand/immer', never]],
  [],
  DragMoveSlice & DragMoveActions
> = (set) => ({
  dragGhost: null,
  dragMoveDragging: false,

  setDragGhost: (range: DragGhostRange | null) =>
    set((s) => { s.dragGhost = range }),

  setDragMoveDragging: (dragging: boolean) =>
    set((s) => { s.dragMoveDragging = dragging }),
})
