import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Field } from '@/lib/types'

import KanbanView from './KanbanView'
import ListView from './ListView'

interface Props {
  fields: Field[]
  entries: Record<string, unknown>[]
  onEntryClick: (entry: Record<string, unknown>) => void
}

export default function ViewTabs({ fields, entries, onEntryClick }: Props) {
  const selectField = fields.find((f) => f.field_type === 'select')
  const hasKanban = !!selectField

  return (
    <Tabs defaultValue="list">
      <TabsList>
        <TabsTrigger value="list">목록</TabsTrigger>
        {hasKanban && <TabsTrigger value="kanban">칸반</TabsTrigger>}
      </TabsList>
      <TabsContent value="list" className="mt-4">
        <ListView fields={fields} entries={entries} onRowClick={onEntryClick} />
      </TabsContent>
      {hasKanban && selectField && (
        <TabsContent value="kanban" className="mt-4">
          <KanbanView
            groupField={selectField}
            fields={fields}
            entries={entries}
            onCardClick={onEntryClick}
          />
        </TabsContent>
      )}
    </Tabs>
  )
}
