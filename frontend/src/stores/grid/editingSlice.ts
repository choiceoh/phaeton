import type { StateCreator } from 'zustand'
import type { GridState, CellPosition, CellSaveState, EditingSlice, EditingActions } from './types'

export const createEditingSlice: StateCreator<
  GridState,
  [['zustand/immer', never]],
  [],
  EditingSlice & EditingActions
> = (set) => ({
  editingCell: null,
  editValue: null as unknown,
  cellSaveState: new Map<string, CellSaveState>(),

  setEditingCell: (cell: CellPosition | null) =>
    set((s) => { s.editingCell = cell }),

  setEditValue: (value: unknown) =>
    set((s) => { s.editValue = value }),

  setCellSaveState: (next: Map<string, CellSaveState>) =>
    set((s) => { s.cellSaveState = next }),

  updateCellSaveState: (key: string, value: CellSaveState | null) =>
    set((s) => {
      // Immer can't proxy Map internals, so replace with a new Map.
      const next = new Map(s.cellSaveState)
      if (value === null) {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      s.cellSaveState = next
    }),
})
