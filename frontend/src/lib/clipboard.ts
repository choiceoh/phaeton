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

