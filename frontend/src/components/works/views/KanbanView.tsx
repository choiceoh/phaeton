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
import { useEffect, useMemo, useState } from 'react'

import { Ban, LayoutGrid } from 'lucide-react'

import EmptyState from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { Field } from '@/lib/types'

interface Props {
  groupField: Field
  fields: Field[]
  entries: Record<string, unknown>[]
  onCardClick: (entry: Record<string, unknown>) => void
  onCardMove?: (entryId: string, newValue: string) => void
  /** Map of "fromValue" → Set of allowed "toValue" for permission control */
  allowedMoves?: Map<string, Set<string>>
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
  justDropped,
}: {
  entry: Record<string, unknown>
  titleField: Field | undefined
  onClick: () => void
  justDropped?: boolean
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
      className={`cursor-grab p-3 transition-colors hover:bg-accent active:cursor-grabbing ${justDropped ? 'animate-scale-bounce' : ''}`}
      onClick={(e) => {
        // Only fire click if it wasn't a drag.
        if (!isDragging) {
          e.stopPropagation()
          onClick()
        }
      }}
    >
      <p className="truncate text-sm font-medium">
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
  droppedId,
  dropState,
}: {
  column: KanbanColumn
  titleField: Field | undefined
  onCardClick: (entry: Record<string, unknown>) => void
  droppedId?: string | null
  dropState: 'idle' | 'allowed' | 'blocked'
}) {
  const ids = column.entries.map((e) => String(e.id))

  return (
    <div className="min-w-[240px] flex-shrink-0 snap-center">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary">{column.label}</Badge>
        <span className="text-xs text-muted-foreground">{column.entries.length}</span>
        {dropState === 'blocked' && (
          <Ban className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} id={column.value}>
        <div
          className={`min-h-[60px] space-y-2 rounded-lg border-2 p-1 transition-colors ${
            dropState === 'allowed'
              ? 'border-blue-400 bg-blue-50/50'
              : dropState === 'blocked'
                ? 'border-dashed border-muted-foreground/20 bg-muted/30 opacity-50'
                : 'border-transparent'
          }`}
        >
          {column.entries.map((entry) => (
            <SortableCard
              key={String(entry.id)}
              entry={entry}
              titleField={titleField}
              onClick={() => onCardClick(entry)}
              justDropped={droppedId === String(entry.id)}
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
  allowedMoves,
}: Props) {
  const choices = (groupField.options?.choices as string[]) || []
  const titleField = fields.find((f) => f.field_type === 'text')
  const [activeEntry, setActiveEntry] = useState<Record<string, unknown> | null>(null)
  const [droppedId, setDroppedId] = useState<string | null>(null)
  const [fromColumn, setFromColumn] = useState<string | null>(null)

  useEffect(() => {
    if (!droppedId) return
    const t = setTimeout(() => setDroppedId(null), 300)
    return () => clearTimeout(t)
  }, [droppedId])

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

  // Compute which columns are allowed/blocked during drag
  const columnDropStates = useMemo(() => {
    const states = new Map<string, 'idle' | 'allowed' | 'blocked'>()
    if (!fromColumn || !allowedMoves) {
      columns.forEach((c) => states.set(c.value, 'idle'))
      return states
    }
    const allowed = allowedMoves.get(fromColumn)
    columns.forEach((c) => {
      if (c.value === fromColumn) {
        states.set(c.value, 'idle')
      } else if (allowed && allowed.has(c.value)) {
        states.set(c.value, 'allowed')
      } else if (allowed) {
        states.set(c.value, 'blocked')
      } else {
        // No restriction map for this source → all allowed
        states.set(c.value, 'allowed')
      }
    })
    return states
  }, [fromColumn, allowedMoves, columns])

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
    if (entry) {
      const col = findColumnValue(String(entry.id))
      setFromColumn(col ?? null)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveEntry(null)
    setFromColumn(null)
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

    // Check permission
    if (allowedMoves && fromCol) {
      const allowed = allowedMoves.get(fromCol)
      if (allowed && !allowed.has(toCol)) {
        // Blocked — do nothing
        return
      }
    }

    setDroppedId(activeId)
    onCardMove(activeId, toCol === '__none__' ? '' : toCol)
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid className="h-10 w-10" />}
        title="칸반 보드에 표시할 데이터가 없습니다"
        description="데이터를 추가하면 칸반 보드에 카드가 표시됩니다."
      />
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4 sm:snap-none animate-fade-in">
        {columns.map((col) => (
          <DroppableColumn
            key={col.value}
            column={col}
            titleField={titleField}
            onCardClick={onCardClick}
            droppedId={droppedId}
            dropState={columnDropStates.get(col.value) ?? 'idle'}
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
