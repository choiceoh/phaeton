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
          ? 'flex flex-col items-center justify-center gap-2 px-4 py-4 text-center'
          : 'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 text-center sm:px-6 sm:py-12'
      }
    >
      {icon && <div className={compact ? 'text-3xl text-muted-foreground' : 'text-4xl text-muted-foreground'}>{icon}</div>}
      <h3 className={compact ? 'text-sm font-medium' : 'text-base font-medium'}>{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
