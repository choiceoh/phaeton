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
}

export default function PageHeader({ title, description, actions, breadcrumb }: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="breadcrumb" className="mb-1.5 flex items-center gap-1 text-sm text-muted-foreground">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-stone-300" />}
                {item.href ? (
                  <Link to={item.href} className="transition-colors hover:text-stone-900">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-stone-400">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
