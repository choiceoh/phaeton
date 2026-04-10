import type { SelectionRange } from '@/hooks/useGridNavigation'

// Extract a rectangular region from data as a 2D array of raw values.
export function extractSelectionData(
  data: Record<string, unknown>[],
  columnIds: string[],
  range: SelectionRange,
): unknown[][] {
  const r1 = Math.min(range.startRow, range.endRow)
  const r2 = Math.max(range.startRow, range.endRow)
  const c1 = Math.min(range.startCol, range.endCol)
  const c2 = Math.max(range.startCol, range.endCol)

  const result: unknown[][] = []
  for (let r = r1; r <= r2; r++) {
    const row = data[r]
    if (!row) continue
    const cells: unknown[] = []
    for (let c = c1; c <= c2; c++) {
      const colId = columnIds[c]
      if (!colId) continue
      cells.push(row[colId] ?? '')
    }
    result.push(cells)
  }
  return result
}

// Serialize 2D data to TSV string for clipboard.
export function toTSV(matrix: unknown[][]): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          const s = cell == null ? '' : String(cell)
          // Escape tabs and newlines.
          if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
            return `"${s.replace(/"/g, '""')}"`
          }
          return s
        })
        .join('\t'),
    )
    .join('\n')
}

// Parse TSV string from clipboard into 2D array.
export function parseTSV(tsv: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuote = false
  let row: string[] = []

  for (let i = 0; i < tsv.length; i++) {
    const ch = tsv[i]

    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < tsv.length && tsv[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuote = true
      } else if (ch === '\t') {
        row.push(current)
        current = ''
      } else if (ch === '\n') {
        row.push(current)
        current = ''
        rows.push(row)
        row = []
      } else if (ch === '\r') {
        // skip \r, handle \r\n
      } else {
        current += ch
      }
    }
  }

  // Last cell / row.
  row.push(current)
  if (row.length > 1 || row[0] !== '') {
    rows.push(row)
  }

  return rows
}

// Copy selection to clipboard.
export async function copyToClipboard(
  data: Record<string, unknown>[],
  columnIds: string[],
  range: SelectionRange,
): Promise<void> {
  const matrix = extractSelectionData(data, columnIds, range)
  const tsv = toTSV(matrix)
  await navigator.clipboard.writeText(tsv)
}

export interface PasteUpdate {
  rowId: string
  columnId: string
  value: string | null
}

// Build updates from pasted TSV, starting at the given cell position.
export function buildPasteUpdates(
  parsed: string[][],
  data: Record<string, unknown>[],
  columnIds: string[],
  startRow: number,
  startCol: number,
  editableColumns: Set<string>,
): PasteUpdate[] {
  const updates: PasteUpdate[] = []

  for (let r = 0; r < parsed.length; r++) {
    const dataRow = data[startRow + r]
    if (!dataRow) break
    const rowId = String(dataRow.id ?? '')
    if (!rowId) continue

    for (let c = 0; c < parsed[r].length; c++) {
      const colIdx = startCol + c
      const colId = columnIds[colIdx]
      if (!colId || !editableColumns.has(colId)) continue

      const value = parsed[r][c]
      updates.push({ rowId, columnId: colId, value: value === '' ? null : value })
    }
  }

  return updates
}
