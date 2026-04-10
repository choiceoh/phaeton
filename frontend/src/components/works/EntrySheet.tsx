import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Field, Process } from '@/lib/types'

import EntryForm from './EntryForm'

interface Props {
  open: boolean
  onClose: () => void
  fields: Field[]
  initialData?: Record<string, unknown>
  onSubmit: (data: Record<string, unknown>) => void
  submitting?: boolean
  title?: string
  process?: Process
}

export default function EntrySheet({
  open,
  onClose,
  fields,
  initialData,
  onSubmit,
  submitting,
  title,
  process,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[480px] overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title || '새 항목'}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <EntryForm
            fields={fields}
            initialData={initialData}
            onSubmit={(data) => {
              onSubmit(data)
              onClose()
            }}
            onCancel={onClose}
            submitting={submitting}
            process={process}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
