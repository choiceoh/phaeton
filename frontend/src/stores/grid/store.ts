/**
 * Grid store — single Zustand store that owns all spreadsheet-grid UI state.
 *
 * Created per-DataTable instance via `createGridStore()` so that multiple
 * grids on screen don't share state.  Provided to descendants through
 * `GridStoreContext`.
 */
import { createContext, useContext } from 'react'
import { createStore, useStore } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { createNavigationSlice } from './navigationSlice'
import { createEditingSlice } from './editingSlice'
import { createFillSlice } from './fillSlice'
import { createDragMoveSlice } from './dragMoveSlice'
import type { GridState } from './types'

export type GridStore = ReturnType<typeof createGridStore>

export function createGridStore() {
  return createStore<GridState>()(
    immer((...a) => ({
      ...createNavigationSlice(...a),
      ...createEditingSlice(...a),
      ...createFillSlice(...a),
      ...createDragMoveSlice(...a),

      reset: () => {
        const [set] = a
        set((s) => {
          s.activeCell = null
          s.selection = null
          s.editingCell = null
          s.editValue = null
          s.cellSaveState = new Map()
          s.fillPreview = null
          s.fillDragging = false
          s.dragGhost = null
          s.dragMoveDragging = false
        })
      },
    })),
  )
}

// ── React context for per-instance store ─────────────────────────────

export const GridStoreContext = createContext<GridStore | null>(null)

/**
 * Subscribe to a slice of the grid store.
 *
 * Must be called inside a `<GridStoreContext.Provider>`.
 */
export function useGridStore<T>(selector: (state: GridState) => T): T {
  const store = useContext(GridStoreContext)
  if (!store) throw new Error('useGridStore must be used within GridStoreContext.Provider')
  return useStore(store, selector)
}

/**
 * Access the raw store API (for getState() in event handlers).
 */
export function useGridStoreApi(): GridStore {
  const store = useContext(GridStoreContext)
  if (!store) throw new Error('useGridStoreApi must be used within GridStoreContext.Provider')
  return store
}

// ── Optional (no-throw) variants for hooks that work with or without a provider ──

/** Dummy store used when no provider exists — never mutated, avoids conditional hook calls. */
const NOOP_STORE = createGridStore()

/**
 * Like useGridStore but never throws.
 * Returns store-backed value when inside a Provider, otherwise reads from a static dummy store.
 */
export function useOptionalGridStore<T>(selector: (state: GridState) => T): T {
  const store = useContext(GridStoreContext)
  return useStore(store ?? NOOP_STORE, selector)
}

/**
 * Returns the raw store API if inside a Provider, null otherwise.
 */
export function useOptionalGridStoreApi(): GridStore | null {
  return useContext(GridStoreContext)
}
