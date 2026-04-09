/**
 * Tremor Badge 대체 — 아이보리 배경에 맞는 웜톤 배지
 * Tremor Badge는 color prop에 따라 blue/sky/gray 등을 하드코딩하므로
 * 웜톤 디자인에서 통일이 불가능. 직접 구현.
 */
export function WarmBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-ivory-100 px-2 py-0.5 text-sm text-stone-600 ring-1 ring-inset ring-stone-300">
      {children}
    </span>
  )
}
