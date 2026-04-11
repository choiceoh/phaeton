import type { StateCreator } from 'zustand'
import type { GridState, CellPosition, SelectionRange, NavigationSlice, NavigationActions } from './types'

export const createNavigationSlice: StateCreator<
  GridState,
  [['zustand/immer', never]],
  [],
  NavigationSlice & NavigationActions
> = (set) => ({
  activeCell: null,
  selection: null,

  setActiveCell: (cell: CellPosition | null) =>
    set((s) => { s.activeCell = cell }),

  setSelection: (range: SelectionRange | null) =>
    set((s) => { s.selection = range }),
})
