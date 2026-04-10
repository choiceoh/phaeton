import { describe, it, expect } from 'vitest'
import { extractSelectionData, toTSV, parseTSV, buildPasteUpdates } from './clipboard'

describe('extractSelectionData', () => {
  const data = [
    { a: 1, b: 'x', c: true },
    { a: 2, b: 'y', c: false },
    { a: 3, b: 'z', c: true },
  ]
  const cols = ['a', 'b', 'c']

  it('extracts a single cell', () => {
    const result = extractSelectionData(data, cols, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(result).toEqual([[1]])
  })

  it('extracts a range', () => {
    const result = extractSelectionData(data, cols, { startRow: 0, endRow: 1, startCol: 1, endCol: 2 })
    expect(result).toEqual([['x', true], ['y', false]])
  })

  it('normalizes reversed range', () => {
    const result = extractSelectionData(data, cols, { startRow: 1, endRow: 0, startCol: 2, endCol: 1 })
    expect(result).toEqual([['x', true], ['y', false]])
  })

  it('handles missing values as empty string', () => {
    const sparse = [{ a: 1 }]
    const result = extractSelectionData(sparse, ['a', 'b'], { startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(result).toEqual([[1, '']])
  })
})

describe('toTSV', () => {
  it('converts simple matrix', () => {
    expect(toTSV([[1, 2], [3, 4]])).toBe('1\t2\n3\t4')
  })

  it('handles null/undefined', () => {
    expect(toTSV([[null, undefined]])).toBe('\t')
  })

  it('escapes tabs in values', () => {
    expect(toTSV([['a\tb']])).toBe('"a\tb"')
  })

  it('escapes newlines in values', () => {
    expect(toTSV([['a\nb']])).toBe('"a\nb"')
  })

  it('escapes quotes', () => {
    expect(toTSV([['say "hello"']])).toBe('"say ""hello"""')
  })
})

describe('parseTSV', () => {
  it('parses simple TSV', () => {
    expect(parseTSV('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('parses single cell', () => {
    expect(parseTSV('hello')).toEqual([['hello']])
  })

  it('handles quoted fields with tabs', () => {
    expect(parseTSV('"a\tb"\tc')).toEqual([['a\tb', 'c']])
  })

  it('handles quoted fields with newlines', () => {
    expect(parseTSV('"a\nb"\tc')).toEqual([['a\nb', 'c']])
  })

  it('handles escaped quotes', () => {
    expect(parseTSV('"say ""hello"""\tx')).toEqual([['say "hello"', 'x']])
  })

  it('handles \\r\\n line endings', () => {
    expect(parseTSV('a\tb\r\nc\td')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('skips empty trailing row', () => {
    expect(parseTSV('a\tb\n')).toEqual([['a', 'b']])
  })

  it('roundtrips with toTSV', () => {
    const original = [['hello', 'world\ttab'], ['line\nnew', '"quotes"']]
    const tsv = toTSV(original)
    expect(parseTSV(tsv)).toEqual(original)
  })
})

describe('buildPasteUpdates', () => {
  const data = [
    { id: 'r1', name: 'A', count: 1 },
    { id: 'r2', name: 'B', count: 2 },
    { id: 'r3', name: 'C', count: 3 },
  ]
  const cols = ['name', 'count']
  const editable = new Set(['name', 'count'])

  it('builds updates from paste', () => {
    const parsed = [['X', '10'], ['Y', '20']]
    const updates = buildPasteUpdates(parsed, data, cols, 0, 0, editable)
    expect(updates).toEqual([
      { rowId: 'r1', columnId: 'name', value: 'X' },
      { rowId: 'r1', columnId: 'count', value: '10' },
      { rowId: 'r2', columnId: 'name', value: 'Y' },
      { rowId: 'r2', columnId: 'count', value: '20' },
    ])
  })

  it('skips non-editable columns', () => {
    const limited = new Set(['name'])
    const updates = buildPasteUpdates([['X', '10']], data, cols, 0, 0, limited)
    expect(updates).toEqual([
      { rowId: 'r1', columnId: 'name', value: 'X' },
    ])
  })

  it('converts empty string to null', () => {
    const updates = buildPasteUpdates([['', '10']], data, cols, 0, 0, editable)
    expect(updates[0].value).toBeNull()
  })

  it('stops at data boundary', () => {
    const updates = buildPasteUpdates([['X'], ['Y'], ['Z'], ['W']], data, cols, 1, 0, editable)
    // Only rows 1, 2 exist (starting at index 1)
    expect(updates).toHaveLength(2)
  })

  it('handles offset start position', () => {
    const updates = buildPasteUpdates([['99']], data, ['name', 'count'], 1, 1, editable)
    expect(updates).toEqual([
      { rowId: 'r2', columnId: 'count', value: '99' },
    ])
  })
})
