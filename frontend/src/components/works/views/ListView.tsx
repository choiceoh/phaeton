import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from '@/components/common/DataTable'
import { isLayoutType } from '@/lib/constants'
import { formatCell } from '@/lib/formatCell'
import type { Field } from '@/lib/types'

interface Props {
  fields: Field[]
  entries: Record<string, unknown>[]
  onRowClick: (entry: Record<string, unknown>) => void
}

export default function ListView({ fields, entries, onRowClick }: Props) {
  const visibleFields = useMemo(
    () => fields.filter((f) => !isLayoutType(f.field_type)),
    [fields],
  )

  const numericFields = useMemo(
    () => fields.filter((f) => f.field_type === 'number' || f.field_type === 'integer'),
    [fields],
  )

  const summaryRow = useMemo(() => {
    if (numericFields.length === 0 || entries.length === 0) return undefined
    const summary: Record<string, { label: string; value: string | number }> = {}
    for (const f of numericFields) {
      const values = entries
        .map((e) => Number(e[f.slug]))
        .filter((n) => !isNaN(n))
      if (values.length === 0) continue
      const sum = values.reduce((a, b) => a + b, 0)
      const avg = sum / values.length
      summary[f.slug] = {
        label: `합계 ${sum.toLocaleString('ko')} / 평균 ${avg.toLocaleString('ko', { maximumFractionDigits: 1 })} (현재 페이지)`,
        value: sum,
      }
    }
    return Object.keys(summary).length > 0 ? summary : undefined
  }, [numericFields, entries])

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols: ColumnDef<Record<string, unknown>>[] = visibleFields.map((f) => ({
      id: f.slug,
      header: f.label,
      enableSorting: false,
      size: f.field_type === 'textarea' ? 250 : 150,
      cell: ({ row }: { row: { original: Record<string, unknown> } }) =>
        formatCell(row.original[f.slug], f),
    }))
    cols.push({
      id: 'created_at',
      header: '작성일',
      enableSorting: false,
      size: 100,
      cell: ({ row }) => {
        const v = row.original.created_at
        if (!v) return '-'
        return new Date(v as string).toLocaleDateString('ko')
      },
    })
    return cols
  }, [visibleFields])

  if (entries.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        아직 항목이 없습니다
      </div>
    )
  }

  return (
    <DataTable
      columns={columns}
      data={entries}
      onRowClick={onRowClick}
      summaryRow={summaryRow}
    />
  )
}
