import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import { useCollections } from '@/hooks/useCollections'

export default function SheetTabBar() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const { data: allCollections } = useCollections()

  // Find current collection and its siblings in the same workbook
  const siblings = useMemo(() => {
    if (!allCollections || !appId) return []
    const cur = allCollections.find((c) => c.id === appId) ?? null
    if (!cur?.workbook_id) return cur ? [cur] : []
    return allCollections
      .filter((c) => c.workbook_id === cur.workbook_id)
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [allCollections, appId])

  if (siblings.length === 0) return null

  return (
    <div className="flex items-center h-[22px] bg-[#e6e6e6] border-t border-[#d4d4d4] select-none">
      {/* Navigation arrows */}
      <div className="flex items-center border-r border-[#d4d4d4] px-0.5 h-full">
        <button
          type="button"
          className="p-0.5 hover:bg-[#d0d0d0] rounded-sm"
          aria-label="이전 시트"
        >
          <ChevronLeft className="h-3 w-3 text-[#666]" />
        </button>
        <button
          type="button"
          className="p-0.5 hover:bg-[#d0d0d0] rounded-sm"
          aria-label="다음 시트"
        >
          <ChevronRight className="h-3 w-3 text-[#666]" />
        </button>
      </div>

      {/* Sheet tabs */}
      <div className="flex items-end gap-0 overflow-x-auto scrollbar-none flex-1 h-full">
        {siblings.map((col) => {
          const isActive = col.id === appId
          return (
            <button
              key={col.id}
              type="button"
              className={`inline-flex items-center px-3 text-[11px] border-r border-[#d4d4d4] h-full transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white text-[#333] font-medium border-t-2 border-t-[#005a9e]'
                  : 'bg-[#e6e6e6] text-[#666] hover:bg-[#d8d8d8]'
              }`}
              onClick={() => {
                if (!isActive) navigate(`/apps/${col.id}`)
              }}
            >
              {col.label}
            </button>
          )
        })}
      </div>

      {/* Add sheet button */}
      <div className="flex items-center border-l border-[#d4d4d4] px-1 h-full">
        <button
          type="button"
          className="p-0.5 hover:bg-[#d0d0d0] rounded-sm"
          aria-label="시트 추가"
          title="새 시트"
        >
          <Plus className="h-3 w-3 text-[#666]" />
        </button>
      </div>
    </div>
  )
}
