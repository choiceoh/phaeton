import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  label?: string
  variant?: 'spinner' | 'card-grid' | 'table' | 'summary'
  count?: number
}

export default function LoadingState({
  label = '로딩 중...',
  variant = 'spinner',
  count,
}: Props) {
  if (variant === 'card-grid') return <CardGridSkeleton count={count ?? 6} />
  if (variant === 'table') return <TableSkeleton count={count ?? 5} />
  if (variant === 'summary') return <SummarySkeleton />

  return (
    <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground sm:py-12">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
      <span>{label}</span>
    </div>
  )
}

function CardGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid justify-center gap-4 grid-cols-[repeat(auto-fill,minmax(280px,340px))]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

function TableSkeleton({ count }: { count: number }) {
  return (
    <div className="rounded-lg border">
      {/* Header */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      {/* Rows */}
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  )
}
