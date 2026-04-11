import { useCallback, useMemo } from 'react'
import type { CellPosition, SelectionRange } from './useGridNavigation'
import { normalize } from './useGridNavigation'
import type { CellFormat, CellFormats, EntryRow } from '@/lib/types'

interface UseCellFormattingOptions {
  data: EntryRow[]
  activeCell: CellPosition | null
  selection: SelectionRange | null
  columnIds: string[]
  readOnlyColumns?: Set<string>
  batchUpdate: (updates: { id: string; fields: Record<string, unknown> }[]) => void
}

export function useCellFormatting({
  data,
  activeCell,
  selection,
  columnIds,
  readOnlyColumns = new Set(['_select', '_actions', '_rowNum', 'created_at', '_status']),
  batchUpdate,
}: UseCellFormattingOptions) {
  // Collect all cells in current selection (or just active cell).
  const selectedCells = useMemo(() => {
    if (!activeCell) return []
    const range = selection
      ? normalize(selection)
      : { startRow: activeCell.row, startCol: activeCell.col, endRow: activeCell.row, endCol: activeCell.col }
    const cells: { rowIdx: number; colId: string }[] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        const colId = columnIds[c]
        if (colId && !readOnlyColumns.has(colId)) {
          cells.push({ rowIdx: r, colId })
        }
      }
    }
    return cells
  }, [activeCell, selection, columnIds, readOnlyColumns])

  // Get the common format across all selected cells.
  const currentFormat = useMemo<CellFormat | null>(() => {
    if (selectedCells.length === 0) return null
    const formats = selectedCells.map(({ rowIdx, colId }) => {
      const row = data[rowIdx] as EntryRow | undefined
      return row?._cell_formats?.[colId] ?? {}
    })
    // Intersection: only include properties that are the same across all cells.
    const first = formats[0]
    const common: CellFormat = {}
    if (first.bg && formats.every((f) => f.bg === first.bg)) common.bg = first.bg
    if (first.color && formats.every((f) => f.color === first.color)) common.color = first.color
    if (first.bold && formats.every((f) => f.bold)) common.bold = true
    if (first.italic && formats.every((f) => f.italic)) common.italic = true
    if (first.fontSize && formats.every((f) => f.fontSize === first.fontSize)) common.fontSize = first.fontSize
    return common
  }, [selectedCells, data])

  const applyFormat = useCallback(
    (patch: Partial<CellFormat>) => {
      if (selectedCells.length === 0) return

      // For toggle properties (bold, italic), check if ALL selected cells have it.
      const resolvedPatch = { ...patch }
      if ('bold' in patch && patch.bold !== undefined) {
        const allBold = selectedCells.every(({ rowIdx, colId }) => {
          const row = data[rowIdx] as EntryRow | undefined
          return row?._cell_formats?.[colId]?.bold
        })
        resolvedPatch.bold = !allBold
      }
      if ('italic' in patch && patch.italic !== undefined) {
        const allItalic = selectedCells.every(({ rowIdx, colId }) => {
          const row = data[rowIdx] as EntryRow | undefined
          return row?._cell_formats?.[colId]?.italic
        })
        resolvedPatch.italic = !allItalic
      }

      // Group cells by row.
      const byRow = new Map<number, string[]>()
      for (const { rowIdx, colId } of selectedCells) {
        const list = byRow.get(rowIdx) ?? []
        list.push(colId)
        byRow.set(rowIdx, list)
      }

      const updates: { id: string; fields: Record<string, unknown> }[] = []
      for (const [rowIdx, colIds] of byRow) {
        const row = data[rowIdx] as EntryRow | undefined
        if (!row) continue
        const existing: CellFormats = { ...(row._cell_formats ?? {}) }
        for (const colId of colIds) {
          const cellFmt: CellFormat = { ...(existing[colId] ?? {}) }
          // Merge patch.
          for (const [key, val] of Object.entries(resolvedPatch)) {
            if (val === undefined || val === false) {
              delete (cellFmt as Record<string, unknown>)[key]
            } else {
              ;(cellFmt as Record<string, unknown>)[key] = val
            }
          }
          // Remove empty entries.
          if (Object.keys(cellFmt).length === 0) {
            delete existing[colId]
          } else {
            existing[colId] = cellFmt
          }
        }
        updates.push({ id: row.id, fields: { _cell_formats: existing } })
      }

      if (updates.length > 0) {
        batchUpdate(updates)
      }
    },
    [selectedCells, data, batchUpdate],
  )

  return { currentFormat, applyFormat }
}
