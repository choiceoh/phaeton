export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    </div>
  )
}
