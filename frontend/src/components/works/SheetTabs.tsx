import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Table2 } from 'lucide-react'

import { useCollections } from '@/hooks/useCollections'
import type { Collection } from '@/lib/types'

interface SheetTabsProps {
  workbookId: string | undefined
  currentCollectionId: string
}

export default function SheetTabs({ workbookId, currentCollectionId }: SheetTabsProps) {
  const navigate = useNavigate()
  const { data: allCollections } = useCollections()

  const siblings = useMemo(() => {
    if (!workbookId || !allCollections) return []
    return allCollections
      .filter((c: Collection) => c.workbook_id === workbookId)
      .sort((a: Collection, b: Collection) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
  }, [workbookId, allCollections])

  if (siblings.length <= 1) return null

  return (
    <div className="flex items-center border-t border-border/40 bg-muted/30 px-2 py-0.5 overflow-x-auto scrollbar-none shrink-0">
      {siblings.map((sheet: Collection) => {
        const isActive = sheet.id === currentCollectionId
        return (
          <button
            key={sheet.id}
            type="button"
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-[13px] whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
            onClick={() => {
              if (!isActive) navigate(`/apps/${sheet.id}`)
            }}
          >
            <Table2 className="h-3.5 w-3.5" />
            {sheet.label}
          </button>
        )
      })}
    </div>
  )
}
