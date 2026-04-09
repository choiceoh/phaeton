'use client'

export default function FrontendError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold text-red-700">오류가 발생했습니다</h2>
      <p className="text-sm text-stone-500">
        {error.message || '페이지를 불러오는 중 문제가 발생했습니다.'}
      </p>
      <button
        onClick={reset}
        className="rounded bg-stone-700 px-4 py-2 text-sm text-white hover:bg-stone-800"
      >
        다시 시도
      </button>
    </div>
  )
}
