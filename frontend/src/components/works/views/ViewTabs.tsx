import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Field, Process } from '@/lib/types'

import KanbanView from './KanbanView'
import ListView from './ListView'

interface Props {
  fields: Field[]
  entries: Record<string, unknown>[]
  onEntryClick: (entry: Record<string, unknown>) => void
  onCardMove?: (entryId: string, newValue: string) => void
  process?: Process
}

export default function ViewTabs({ fields, entries, onEntryClick, onCardMove, process }: Props) {
  const selectField = fields.find((f) => f.field_type === 'select')
  const hasKanban = !!selectField
  const hasProcessKanban = process?.is_enabled && (process.statuses?.length ?? 0) > 0

  // Build a synthetic "field" for the process status kanban.
  const processGroupField: Field | undefined = hasProcessKanban
    ? {
        id: '_status',
        collection_id: '',
        slug: '_status',
        label: '상태',
        field_type: 'select',
        is_required: false,
        is_unique: false,
        is_indexed: false,
        width: 6,
        height: 1,
        sort_order: 0,
        created_at: '',
        updated_at: '',
        options: {
          choices: process!.statuses.map((s) => s.name),
        },
      }
    : undefined

  return (
    <Tabs defaultValue="list">
      <TabsList>
        <TabsTrigger value="list">목록</TabsTrigger>
        {hasProcessKanban && <TabsTrigger value="status-kanban">상태별</TabsTrigger>}
        {hasKanban && <TabsTrigger value="kanban">보드</TabsTrigger>}
      </TabsList>
      <TabsContent value="list" className="mt-4">
        <ListView fields={fields} entries={entries} onRowClick={onEntryClick} />
      </TabsContent>
      {hasProcessKanban && processGroupField && (
        <TabsContent value="status-kanban" className="mt-4">
          <KanbanView
            groupField={processGroupField}
            fields={fields}
            entries={entries}
            onCardClick={onEntryClick}
            onCardMove={onCardMove}
          />
        </TabsContent>
      )}
      {hasKanban && selectField && (
        <TabsContent value="kanban" className="mt-4">
          <KanbanView
            groupField={selectField}
            fields={fields}
            entries={entries}
            onCardClick={onEntryClick}
            onCardMove={onCardMove}
          />
        </TabsContent>
      )}
    </Tabs>
  )
}
