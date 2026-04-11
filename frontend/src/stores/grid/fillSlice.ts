import type { StateCreator } from 'zustand'
import type { GridState, FillPreviewRange, FillSlice, FillActions } from './types'

export const createFillSlice: StateCreator<
  GridState,
  [['zustand/immer', never]],
  [],
  FillSlice & FillActions
> = (set) => ({
  fillPreview: null,
  fillDragging: false,

  setFillPreview: (range: FillPreviewRange | null) =>
    set((s) => { s.fillPreview = range }),

  setFillDragging: (dragging: boolean) =>
    set((s) => { s.fillDragging = dragging }),
})
