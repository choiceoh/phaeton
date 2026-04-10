import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export default function EmptyState({ title, description, icon, action, compact }: Props) {
  return (
    <div
      className={
        compact
          ? 'flex flex-col items-center justify-center gap-2 px-4 py-4 text-center animate-fade-in'
          : 'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center sm:px-6 sm:py-14 animate-fade-in'
      }
    >
      {icon && (
        <div className={compact
          ? 'flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-400'
          : 'flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 text-stone-400'
        }>{icon}</div>
      )}
      <h3 className={compact ? 'text-sm font-medium' : 'text-base font-medium text-stone-700'}>{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
