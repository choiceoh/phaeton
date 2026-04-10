import { ImageOff } from 'lucide-react'
import { useMemo } from 'react'

import { Card } from '@/components/ui/card'
import type { Field } from '@/lib/types'
import { formatCell } from '@/lib/formatCell'
import { isLayoutType } from '@/lib/constants'

interface Props {
  imageField: Field
  fields: Field[]
  entries: Record<string, unknown>[]
  onEntryClick: (entry: Record<string, unknown>) => void
}

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return /\.(jpe?g|png|gif|webp|svg|bmp|avif)(\?|$)/i.test(lower)
}

export default function GalleryView({ imageField, fields, entries, onEntryClick }: Props) {
  const titleField = useMemo(
    () => fields.find((f) => f.field_type === 'text'),
    [fields],
  )

  // Show up to 3 extra detail fields (non-layout, non-file, non-title).
  const detailFields = useMemo(
    () =>
      fields
        .filter(
          (f) =>
            !isLayoutType(f.field_type) &&
            f.field_type !== 'file' &&
            f.id !== titleField?.id,
        )
        .slice(0, 3),
    [fields, titleField],
  )

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {entries.map((entry) => {
        const imageUrl = entry[imageField.slug] as string | undefined
        const hasImage = imageUrl && isImageUrl(imageUrl)
        const title = titleField
          ? String(entry[titleField.slug] ?? '')
          : `#${String(entry.id).slice(0, 8)}`

        return (
          <Card
            key={String(entry.id)}
            className="cursor-pointer overflow-hidden transition-colors hover:bg-accent"
            onClick={() => onEntryClick(entry)}
          >
            {/* Image area */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
              {hasImage ? (
                <img
                  src={imageUrl}
                  alt={title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-8 w-8" />
                </div>
              )}
            </div>

            {/* Content area */}
            <div className="space-y-1 p-3">
              <p className="truncate text-sm font-medium">
                {title || '(무제)'}
              </p>
              {detailFields.map((f) => {
                const val = entry[f.slug]
                if (val == null) return null
                return (
                  <p key={f.id} className="truncate text-xs text-muted-foreground">
                    <span className="font-medium">{f.label}:</span>{' '}
                    {formatCell(val, f)}
                  </p>
                )
              })}
              <p className="text-[11px] text-muted-foreground">
                {entry.created_at
                  ? new Date(entry.created_at as string).toLocaleDateString('ko')
                  : ''}
              </p>
            </div>
          </Card>
        )
      })}

      {entries.length === 0 && (
        <div className="col-span-full rounded border-2 border-dashed p-8 text-center text-sm text-muted-foreground">
          데이터가 없습니다
        </div>
      )}
    </div>
  )
}
