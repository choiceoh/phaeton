import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { Field } from '@/lib/types'

interface Props {
  groupField: Field
  fields: Field[]
  entries: Record<string, unknown>[]
  onCardClick: (entry: Record<string, unknown>) => void
  onCardMove?: (entryId: string, newValue: string) => void
}

interface KanbanColumn {
  label: string
  value: string
  entries: Record<string, unknown>[]
}

function SortableCard({
  entry,
  titleField,
  onClick,
}: {
  entry: Record<string, unknown>
  titleField: Field | undefined
  onClick: () => void
}) {
  const id = String(entry.id)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { entry },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab p-3 transition-colors hover:bg-accent active:cursor-grabbing"
      onClick={(e) => {
        // Only fire click if it wasn't a drag.
        if (!isDragging) {
          e.stopPropagation()
          onClick()
        }
      }}
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
  )
}

function DroppableColumn({
  column,
  titleField,
  onCardClick,
}: {
  column: KanbanColumn
  titleField: Field | undefined
  onCardClick: (entry: Record<string, unknown>) => void
}) {
  const ids = column.entries.map((e) => String(e.id))

  return (
    <div className="min-w-[240px] flex-shrink-0">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary">{column.label}</Badge>
        <span className="text-xs text-muted-foreground">{column.entries.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} id={column.value}>
        <div className="min-h-[60px] space-y-2 rounded-lg border-2 border-transparent p-1">
          {column.entries.map((entry) => (
            <SortableCard
              key={String(entry.id)}
              entry={entry}
              titleField={titleField}
              onClick={() => onCardClick(entry)}
            />
          ))}
          {column.entries.length === 0 && (
            <div className="rounded border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
              비어 있음
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

export default function KanbanView({
  groupField,
  fields,
  entries,
  onCardClick,
  onCardMove,
}: Props) {
  const choices = (groupField.options?.choices as string[]) || []
  const titleField = fields.find((f) => f.field_type === 'text')
  const [activeEntry, setActiveEntry] = useState<Record<string, unknown> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const columns: KanbanColumn[] = choices.map((value) => ({
    label: value,
    value,
    entries: entries.filter((e) => e[groupField.slug] === value),
  }))

  // Uncategorized column.
  const known = new Set(choices)
  const uncategorized = entries.filter((e) => !known.has(e[groupField.slug] as string))
  if (uncategorized.length > 0) {
    columns.push({ label: '미분류', value: '__none__', entries: uncategorized })
  }

  function findColumnValue(entryId: string): string | undefined {
    for (const col of columns) {
      if (col.entries.some((e) => String(e.id) === entryId)) return col.value
      // The over target might be the column id itself.
      if (col.value === entryId) return col.value
    }
    return undefined
  }

  function handleDragStart(event: DragStartEvent) {
    const entry = event.active.data.current?.entry as Record<string, unknown> | undefined
    setActiveEntry(entry ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveEntry(null)
    const { active, over } = event
    if (!over || !onCardMove) return

    const activeId = String(active.id)
    const overId = String(over.id)

    const fromCol = findColumnValue(activeId)
    // over can be a card id or a column (SortableContext) id.
    let toCol = findColumnValue(overId)
    // If overId matches a column value directly, use that.
    if (choices.includes(overId) || overId === '__none__') {
      toCol = overId
    }

    if (!toCol || fromCol === toCol) return
    onCardMove(activeId, toCol === '__none__' ? '' : toCol)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <DroppableColumn
            key={col.value}
            column={col}
            titleField={titleField}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeEntry && (
          <Card className="w-[220px] p-3 shadow-lg">
            <p className="text-sm font-medium">
              {titleField
                ? String(activeEntry[titleField.slug] || '제목 없음')
                : `#${String(activeEntry.id).slice(0, 8)}`}
            </p>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  )
}
