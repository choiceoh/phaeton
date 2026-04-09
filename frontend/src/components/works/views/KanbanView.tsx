import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { Field } from '@/lib/types'

interface Props {
  groupField: Field
  fields: Field[]
  entries: Record<string, unknown>[]
  onCardClick: (entry: Record<string, unknown>) => void
}

export default function KanbanView({ groupField, fields, entries, onCardClick }: Props) {
  const choices = (groupField.options?.choices as string[]) || []
  const titleField = fields.find((f) => f.field_type === 'text')

  const columns = choices.map((value) => ({
    label: value,
    value,
    entries: entries.filter((e) => e[groupField.slug] === value),
  }))

  // Add uncategorized column.
  const known = new Set(choices)
  const uncategorized = entries.filter((e) => !known.has(e[groupField.slug] as string))
  if (uncategorized.length > 0) {
    columns.push({ label: '미분류', value: '__none__', entries: uncategorized })
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.value} className="min-w-[240px] flex-shrink-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">{col.label}</Badge>
            <span className="text-xs text-muted-foreground">{col.entries.length}</span>
          </div>
          <div className="space-y-2">
            {col.entries.map((entry, i) => (
              <Card
                key={(entry.id as string) || i}
                className="cursor-pointer p-3 transition-colors hover:bg-accent"
                onClick={() => onCardClick(entry)}
              >
                <p className="text-sm font-medium">
                  {titleField
                    ? String(entry[titleField.slug] || '제목 없음')
                    : `#${String(entry.id).slice(0, 8)}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.created_at
                    ? new Date(entry.created_at as string).toLocaleDateString('ko')
                    : ''}
                </p>
              </Card>
            ))}
            {col.entries.length === 0 && (
              <div className="rounded border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                비어 있음
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
