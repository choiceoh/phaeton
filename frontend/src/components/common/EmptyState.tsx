import { Lock, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

type Variant = 'empty' | 'no-results' | 'no-permission'

interface Props {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  compact?: boolean
  variant?: Variant
}

const VARIANT_ICONS: Record<Variant, ReactNode> = {
  'empty': null,
  'no-results': <SearchX className="h-10 w-10" />,
  'no-permission': <Lock className="h-10 w-10" />,
}

const VARIANT_BORDER: Record<Variant, string> = {
  'empty': 'border-dashed border-stone-300',
  'no-results': 'border-dashed border-stone-200',
  'no-permission': 'border-dashed border-destructive/20',
}

export default function EmptyState({ title, description, icon, action, compact, variant = 'empty' }: Props) {
  const resolvedIcon = icon ?? VARIANT_ICONS[variant]

  return (
    <div
      className={
        compact
          ? 'flex flex-col items-center justify-center gap-2 px-4 py-4 text-center animate-fade-in'
          : `flex flex-col items-center justify-center gap-3 rounded-xl border px-4 py-8 text-center sm:px-6 sm:py-14 animate-fade-in ${VARIANT_BORDER[variant]}`
      }
    >
      {resolvedIcon && (
        <div className={compact
          ? 'flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-400'
          : 'flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-stone-400'
        }>{resolvedIcon}</div>
      )}
      <h3 className={compact ? 'text-sm font-medium' : 'text-base font-medium text-stone-700'}>{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
