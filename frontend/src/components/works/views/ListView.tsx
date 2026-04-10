import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isLayoutType } from '@/lib/constants'
import type { Field } from '@/lib/types'

interface Props {
  fields: Field[]
  entries: Record<string, unknown>[]
  onRowClick: (entry: Record<string, unknown>) => void
}

export default function ListView({ fields, entries, onRowClick }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        아직 항목이 없습니다
      </div>
    )
  }

  const visibleFields = fields.filter((f) => !isLayoutType(f.field_type)).slice(0, 6)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {visibleFields.map((f) => (
            <TableHead key={f.id}>{f.label}</TableHead>
          ))}
          <TableHead className="w-24">작성일</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, i) => (
          <TableRow
            key={(entry.id as string) || i}
            className="cursor-pointer"
            onClick={() => onRowClick(entry)}
          >
            {visibleFields.map((f) => (
              <TableCell key={f.id}>{formatCell(entry[f.slug], f.field_type)}</TableCell>
            ))}
            <TableCell className="text-xs text-muted-foreground">
              {entry.created_at ? new Date(entry.created_at as string).toLocaleDateString('ko') : ''}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function formatCell(value: unknown, fieldType: string): string {
  if (value == null) return '-'
  if (fieldType === 'boolean') return value ? '✓' : '-'
  if (fieldType === 'date' || fieldType === 'datetime') {
    return new Date(value as string).toLocaleDateString('ko')
  }
  if (fieldType === 'time') return String(value)
  if (fieldType === 'multiselect' && Array.isArray(value)) {
    return value.join(', ')
  }
  if (fieldType === 'textarea') {
    const s = String(value)
    return s.length > 100 ? s.slice(0, 100) + '...' : s
  }
  if (fieldType === 'json') {
    return JSON.stringify(value)
  }
  return String(value)
}
