// Public API — re-export everything consumers need.

// Types (canonical source)
export type {
  CellPosition,
  SelectionRange,
  FillPreviewRange,
  DragGhostRange,
  CellSaveState,
  GridState,
} from './types'
export { normalize, isCellInRange } from './types'

// Store
export { createGridStore, GridStoreContext, useGridStore, useGridStoreApi } from './store'
export type { GridStore } from './store'

// Selectors
export * from './selectors'
