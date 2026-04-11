/**
 * useGridBuffer — Local-first grid buffer for free-grid editing.
 *
 * Manages an in-memory copy of all grid rows. Edits are purely local
 * until save() is called. Supports:
 * - Free cell editing (no type validation on input)
 * - Free row addition/deletion
 * - Dirty tracking per cell
 * - Batch save with type coercion + error reporting
 * - Auto-save on debounce timer
 * - Formula recomputation via useFormulaEngine
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { coerceForSave } from '@/lib/coercion'
import { isComputedType, isLayoutType } from '@/lib/constants'
import { queryKeys } from '@/lib/queryKeys'
import type { EntryRow, Field } from '@/lib/types'
import { useFormulaEngine } from './useFormulaEngine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GridBufferOptions {
  serverData: EntryRow[]
  fields: Field[]
  enabled: boolean
  slug: string
}

export interface SaveResult {
  success: boolean
  created: number
  updated: number
  deleted: number
  errors: Map<string, Map<string, string>>
}

export interface GridBufferReturn {
  // Data
  rows: EntryRow[]

  // Mutations (all local, no network)
  setCellValue: (rowId: string, fieldSlug: string, value: unknown) => void
  addRow: (initialValues?: Record<string, unknown>) => string
  addRows: (count: number) => string[]
  deleteRow: (rowId: string) => void
  undeleteRow: (rowId: string) => void

  // State
  isDirty: boolean
  dirtyCount: number
  isSaving: boolean
  cellErrors: Map<string, Map<string, string>>
  isNewRow: (rowId: string) => boolean
  isDeletedRow: (rowId: string) => boolean
  isCellDirty: (rowId: string, fieldSlug: string) => boolean

  // Save
  save: () => Promise<SaveResult>
  discardChanges: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_SAVE_DELAY_MS = 5_000
let _newRowCounter = 0

function generateNewRowId(): string {
  return `__new_${Date.now()}_${++_newRowCounter}`
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGridBuffer({
  serverData,
  fields,
  enabled,
  slug,
}: GridBufferOptions): GridBufferReturn {
  const qc = useQueryClient()
  const { recomputeRow } = useFormulaEngine(fields)

  // ---- Core state ----
  const [rows, setRows] = useState<EntryRow[]>([])
  const [dirtyFields, setDirtyFields] = useState<Map<string, Set<string>>>(new Map())
  const [newRowIds, setNewRowIds] = useState<Set<string>>(new Set())
  const [deletedRowIds, setDeletedRowIds] = useState<Set<string>>(new Set())
  const [cellErrors, setCellErrors] = useState<Map<string, Map<string, string>>>(new Map())
  const [isSaving, setIsSaving] = useState(false)

  // Snapshot of server data for diffing and discard
  const serverSnapshotRef = useRef<EntryRow[]>([])
  // Stash deleted rows for undelete
  const deletedRowsStash = useRef<Map<string, { row: EntryRow; index: number }>>(new Map())
  // Auto-save timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- Derived state ----
  const isDirty = dirtyFields.size > 0 || newRowIds.size > 0 || deletedRowIds.size > 0
  const dirtyCount = useMemo(() => {
    let count = 0
    for (const fieldSet of dirtyFields.values()) count += fieldSet.size
    count += newRowIds.size
    count += deletedRowIds.size
    return count
  }, [dirtyFields, newRowIds, deletedRowIds])

  // ---- Editable fields (exclude layout, computed) ----
  const editableFieldSlugs = useMemo(() => {
    const set = new Set<string>()
    for (const f of fields) {
      if (!isLayoutType(f.field_type) && !isComputedType(f.field_type)) {
        set.add(f.slug)
      }
    }
    return set
  }, [fields])

  const fieldBySlug = useMemo(() => {
    const map = new Map<string, Field>()
    for (const f of fields) map.set(f.slug, f)
    return map
  }, [fields])

  // ---- Sync from server data ----
  useEffect(() => {
    if (!enabled || !serverData.length) return
    // Only sync if buffer is clean (not dirty)
    if (isDirty) return
    serverSnapshotRef.current = serverData
    setRows([...serverData])
    setDirtyFields(new Map())
    setNewRowIds(new Set())
    setDeletedRowIds(new Set())
    setCellErrors(new Map())
    deletedRowsStash.current.clear()
  }, [serverData, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-save timer ----
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      // Auto-save fires; errors shown as toast, not blocking
      save().catch(() => {})
    }, AUTO_SAVE_DELAY_MS)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup auto-save on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [])

  // ---- Cell value mutation ----
  const setCellValue = useCallback(
    (rowId: string, fieldSlug: string, value: unknown) => {
      setRows((prev) => {
        const idx = prev.findIndex((r) => String(r.id) === rowId)
        if (idx === -1) return prev
        const updated = { ...prev[idx], [fieldSlug]: value }
        // Recompute formula fields
        const formulaOverrides = recomputeRow(updated, fieldSlug)
        const final = { ...updated, ...formulaOverrides }
        const next = [...prev]
        next[idx] = final
        return next
      })

      // Track dirty
      setDirtyFields((prev) => {
        const next = new Map(prev)
        const set = new Set(next.get(rowId) ?? [])
        set.add(fieldSlug)
        next.set(rowId, set)
        return next
      })

      // Clear cell error if exists
      setCellErrors((prev) => {
        if (!prev.has(rowId)) return prev
        const rowErrors = prev.get(rowId)!
        if (!rowErrors.has(fieldSlug)) return prev
        const next = new Map(prev)
        const nextRowErrors = new Map(rowErrors)
        nextRowErrors.delete(fieldSlug)
        if (nextRowErrors.size === 0) next.delete(rowId)
        else next.set(rowId, nextRowErrors)
        return next
      })

      scheduleAutoSave()
    },
    [recomputeRow, scheduleAutoSave],
  )

  // ---- Add row ----
  const addRow = useCallback(
    (initialValues?: Record<string, unknown>) => {
      const id = generateNewRowId()
      const defaults: Record<string, unknown> = {}
      for (const f of fields) {
        if (f.default_value != null && editableFieldSlugs.has(f.slug)) {
          defaults[f.slug] = f.default_value
        }
      }
      const newRow: EntryRow = {
        id,
        ...defaults,
        ...initialValues,
        _optimistic: true,
      }
      setRows((prev) => [...prev, newRow])
      setNewRowIds((prev) => new Set(prev).add(id))
      scheduleAutoSave()
      return id
    },
    [fields, editableFieldSlugs, scheduleAutoSave],
  )

  const addRows = useCallback(
    (count: number) => {
      const ids: string[] = []
      const newRows: EntryRow[] = []
      const defaults: Record<string, unknown> = {}
      for (const f of fields) {
        if (f.default_value != null && editableFieldSlugs.has(f.slug)) {
          defaults[f.slug] = f.default_value
        }
      }
      for (let i = 0; i < count; i++) {
        const id = generateNewRowId()
        ids.push(id)
        newRows.push({ id, ...defaults, _optimistic: true })
      }
      setRows((prev) => [...prev, ...newRows])
      setNewRowIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        return next
      })
      scheduleAutoSave()
      return ids
    },
    [fields, editableFieldSlugs, scheduleAutoSave],
  )

  // ---- Delete row ----
  const deleteRow = useCallback(
    (rowId: string) => {
      if (newRowIds.has(rowId)) {
        // New row: just remove entirely
        setRows((prev) => prev.filter((r) => String(r.id) !== rowId))
        setNewRowIds((prev) => {
          const next = new Set(prev)
          next.delete(rowId)
          return next
        })
        setDirtyFields((prev) => {
          const next = new Map(prev)
          next.delete(rowId)
          return next
        })
      } else {
        // Existing row: stash and mark for deletion
        setRows((prev) => {
          const idx = prev.findIndex((r) => String(r.id) === rowId)
          if (idx >= 0) {
            deletedRowsStash.current.set(rowId, { row: prev[idx], index: idx })
          }
          return prev.filter((r) => String(r.id) !== rowId)
        })
        setDeletedRowIds((prev) => new Set(prev).add(rowId))
        // Clean up dirty tracking for this row (will be deleted)
        setDirtyFields((prev) => {
          const next = new Map(prev)
          next.delete(rowId)
          return next
        })
      }
      scheduleAutoSave()
    },
    [newRowIds, scheduleAutoSave],
  )

  // ---- Undelete row ----
  const undeleteRow = useCallback((rowId: string) => {
    const stashed = deletedRowsStash.current.get(rowId)
    if (!stashed) return

    setDeletedRowIds((prev) => {
      const next = new Set(prev)
      next.delete(rowId)
      return next
    })
    setRows((prev) => {
      const next = [...prev]
      // Insert at original position if possible
      const insertIdx = Math.min(stashed.index, next.length)
      next.splice(insertIdx, 0, stashed.row)
      return next
    })
    deletedRowsStash.current.delete(rowId)
  }, [])

  // ---- Save pipeline ----
  const save = useCallback(async (): Promise<SaveResult> => {
    if (!isDirty) {
      return { success: true, created: 0, updated: 0, deleted: 0, errors: new Map() }
    }
    if (isSaving) {
      return { success: false, created: 0, updated: 0, deleted: 0, errors: new Map() }
    }

    // Cancel auto-save timer
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)

    setIsSaving(true)
    const errors = new Map<string, Map<string, string>>()

    try {
      // --- Build diffs ---
      const creates: { tempId: string; body: Record<string, unknown> }[] = []
      const updates: { id: string; fields: Record<string, unknown>; _version?: number }[] = []
      const deleteIds = [...deletedRowIds]

      // Process new rows
      for (const tempId of newRowIds) {
        const row = rows.find((r) => String(r.id) === tempId)
        if (!row) continue
        const body: Record<string, unknown> = {}
        for (const slug of editableFieldSlugs) {
          if (row[slug] != null && row[slug] !== '') {
            const field = fieldBySlug.get(slug)
            if (!field) continue
            const result = coerceForSave(row[slug], field)
            if (!result.success) {
              if (!errors.has(tempId)) errors.set(tempId, new Map())
              errors.get(tempId)!.set(slug, result.error ?? '유효하지 않은 값')
            } else if (result.value != null) {
              body[slug] = result.value
            }
          }
        }
        if (Object.keys(body).length > 0 || errors.size === 0) {
          creates.push({ tempId, body })
        }
      }

      // Process updated rows
      for (const [rowId, changedSlugs] of dirtyFields) {
        if (newRowIds.has(rowId)) continue // already handled above
        const row = rows.find((r) => String(r.id) === rowId)
        if (!row) continue
        const changedFields: Record<string, unknown> = {}
        for (const slug of changedSlugs) {
          const field = fieldBySlug.get(slug)
          if (!field) continue
          const result = coerceForSave(row[slug], field)
          if (!result.success) {
            if (!errors.has(rowId)) errors.set(rowId, new Map())
            errors.get(rowId)!.set(slug, result.error ?? '유효하지 않은 값')
          } else {
            changedFields[slug] = result.value
          }
        }
        if (Object.keys(changedFields).length > 0) {
          updates.push({
            id: rowId,
            fields: changedFields,
            _version: typeof row._version === 'number' ? row._version : undefined,
          })
        }
      }

      // --- Check for coercion errors ---
      if (errors.size > 0) {
        setCellErrors(errors)
        let errorCount = 0
        for (const m of errors.values()) errorCount += m.size
        toast.error(`${errorCount}개 셀에 타입 오류가 있습니다`)
        return { success: false, created: 0, updated: 0, deleted: 0, errors }
      }

      // --- Execute API calls ---
      let createdCount = 0
      let updatedCount = 0
      let deletedCount = 0

      // 1. Deletes
      if (deleteIds.length > 0) {
        await api.del<{ deleted: number }>(`/data/${slug}/bulk`, { ids: deleteIds })
        deletedCount = deleteIds.length
      }

      // 2. Creates (bulk)
      if (creates.length > 0) {
        const bodies = creates.map((c) => c.body)
        await api.post<EntryRow[]>(`/data/${slug}/bulk`, bodies)
        createdCount = creates.length
      }

      // 3. Updates (batch)
      if (updates.length > 0) {
        await api.patch<EntryRow[]>(`/data/${slug}/batch`, { updates })
        updatedCount = updates.length
      }

      // --- Post-save: invalidate cache and reset buffer ---
      await qc.invalidateQueries({ queryKey: queryKeys.entries.collection(slug) })

      // Reset all tracking state (rows will be reloaded from server via useEffect)
      setDirtyFields(new Map())
      setNewRowIds(new Set())
      setDeletedRowIds(new Set())
      setCellErrors(new Map())
      deletedRowsStash.current.clear()

      const total = createdCount + updatedCount + deletedCount
      if (total > 0) {
        toast.success(`저장 완료 (${total}건)`)
      }

      return { success: true, created: createdCount, updated: updatedCount, deleted: deletedCount, errors: new Map() }
    } catch (err) {
      const message = err instanceof Error ? err.message : '저장 실패'
      toast.error(message)
      return { success: false, created: 0, updated: 0, deleted: 0, errors }
    } finally {
      setIsSaving(false)
    }
  }, [isDirty, isSaving, rows, dirtyFields, newRowIds, deletedRowIds, editableFieldSlugs, fieldBySlug, slug, qc])

  // ---- Discard changes ----
  const discardChanges = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    setRows([...serverSnapshotRef.current])
    setDirtyFields(new Map())
    setNewRowIds(new Set())
    setDeletedRowIds(new Set())
    setCellErrors(new Map())
    deletedRowsStash.current.clear()
  }, [])

  // ---- Predicates ----
  const isNewRow = useCallback((rowId: string) => newRowIds.has(rowId), [newRowIds])
  const isDeletedRow = useCallback((rowId: string) => deletedRowIds.has(rowId), [deletedRowIds])
  const isCellDirty = useCallback(
    (rowId: string, fieldSlug: string) => {
      if (newRowIds.has(rowId)) return true
      return dirtyFields.get(rowId)?.has(fieldSlug) ?? false
    },
    [dirtyFields, newRowIds],
  )

  // ---- beforeunload protection ----
  useEffect(() => {
    if (!enabled) return
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled, isDirty])

  // ---- Return passthrough when disabled ----
  if (!enabled) {
    return {
      rows: serverData,
      setCellValue: () => {},
      addRow: () => '',
      addRows: () => [],
      deleteRow: () => {},
      undeleteRow: () => {},
      isDirty: false,
      dirtyCount: 0,
      isSaving: false,
      cellErrors: new Map(),
      isNewRow: () => false,
      isDeletedRow: () => false,
      isCellDirty: () => false,
      save: async () => ({ success: true, created: 0, updated: 0, deleted: 0, errors: new Map() }),
      discardChanges: () => {},
    }
  }

  return {
    rows,
    setCellValue,
    addRow,
    addRows,
    deleteRow,
    undeleteRow,
    isDirty,
    dirtyCount,
    isSaving,
    cellErrors,
    isNewRow,
    isDeletedRow,
    isCellDirty,
    save,
    discardChanges,
  }
}
