export default function ProjectsLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Page title */}
      <div className="h-8 w-48 animate-pulse rounded bg-stone-200" />

      {/* Filter bar */}
      <div className="flex gap-3">
        <div className="h-10 w-40 animate-pulse rounded bg-stone-200" />
        <div className="h-10 w-32 animate-pulse rounded bg-stone-200" />
        <div className="h-10 w-32 animate-pulse rounded bg-stone-200" />
      </div>

      {/* Table header */}
      <div className="h-10 w-full animate-pulse rounded bg-stone-200" />

      {/* Table rows */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded bg-stone-200" />
        ))}
      </div>
    </div>
  )
}
