import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface Props {
  title: string
  description?: string
  actions?: ReactNode
  breadcrumb?: BreadcrumbItem[]
  compact?: boolean
}

export default function PageHeader({ title, description, actions, breadcrumb, compact }: Props) {
  return (
    <div className={`${compact ? 'mb-2' : 'mb-3'} flex flex-wrap items-start justify-between gap-4`}>
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="breadcrumb" className="mb-1 flex items-center gap-1 text-sm text-muted-foreground">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-border" />}
                {item.href ? (
                  <Link to={item.href} className="transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-muted-foreground/60">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-baseline gap-3">
          <h1 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold tracking-tight text-foreground`}>{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
