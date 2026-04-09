export default function AlertsLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Page title */}
      <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />

      {/* Alert sections */}
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="space-y-3">
          {/* Section header */}
          <div className="h-6 w-36 animate-pulse rounded bg-gray-200" />

          {/* Alert cards */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-gray-100 p-4">
              <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
