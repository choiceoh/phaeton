export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header placeholder */}
      <div className="h-8 w-56 animate-pulse rounded bg-stone-200" />

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-stone-200" />
        ))}
      </div>

      {/* Main content area — charts and tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-lg bg-stone-200" />
        ))}
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg bg-stone-200" />
        ))}
      </div>
    </div>
  )
}
