import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import { useExcelToolbar } from '@/contexts/ExcelToolbarContext'
import { useCollections } from '@/hooks/useCollections'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

export default function SheetTabBar() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: allCollections } = useCollections()
  const { statusBar } = useExcelToolbar()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Find current collection and its siblings in the same workbook
  const siblings = useMemo(() => {
    if (!allCollections || !appId) return []
    const cur = allCollections.find((c) => c.id === appId) ?? null
    if (!cur?.workbook_id) return cur ? [cur] : []
    return allCollections
      .filter((c) => c.workbook_id === cur.workbook_id)
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [allCollections, appId])

  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api.patch(`/schema/collections/${id}`, { label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.collections.all })
    },
  })

  const startEditing = useCallback((id: string, label: string) => {
    setEditingId(id)
    setEditValue(label)
  }, [])

  const commitRename = useCallback(() => {
    if (!editingId) return
    const trimmed = editValue.trim()
    const col = siblings.find((c) => c.id === editingId)
    setEditingId(null)
    if (!trimmed || trimmed === col?.label) return
    rename.mutate({ id: editingId, label: trimmed })
  }, [editingId, editValue, siblings, rename])

  const cancelEditing = useCallback(() => {
    setEditingId(null)
  }, [])

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  return (
    <div className="flex items-center h-[32px] bg-[#e6e6e6] border-t border-[#d4d4d4] select-none text-[11px]">
      {/* Navigation arrows */}
      {siblings.length > 0 && (
        <div className="flex items-center border-r border-[#d4d4d4] px-1 h-full">
          <button
            type="button"
            className="p-1 hover:bg-[#d0d0d0] rounded-sm"
            aria-label="이전 시트"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-[#666]" />
          </button>
          <button
            type="button"
            className="p-1 hover:bg-[#d0d0d0] rounded-sm"
            aria-label="다음 시트"
          >
            <ChevronRight className="h-3.5 w-3.5 text-[#666]" />
          </button>
        </div>
      )}

      {/* Sheet tabs */}
      {siblings.length > 0 && (
        <div className="flex items-end gap-0 overflow-x-auto scrollbar-none h-full">
          {siblings.map((col) => {
            const isActive = col.id === appId
            const isEditing = editingId === col.id

            if (isEditing) {
              return (
                <div
                  key={col.id}
                  className={`inline-flex items-center border-r border-[#d4d4d4] h-full ${
                    isActive
                      ? 'bg-white border-t-2 border-t-[#005a9e]'
                      : 'bg-[#e6e6e6]'
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitRename()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEditing()
                      }
                    }}
                    className="h-full px-2 text-[12px] bg-transparent outline-none border border-[#005a9e] min-w-[40px] w-[100px]"
                  />
                </div>
              )
            }

            return (
              <button
                key={col.id}
                type="button"
                className={`inline-flex items-center px-4 text-[12px] border-r border-[#d4d4d4] h-full transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-[#333] font-medium border-t-2 border-t-[#005a9e]'
                    : 'bg-[#e6e6e6] text-[#666] hover:bg-[#d8d8d8]'
                }`}
                onClick={() => {
                  if (!isActive) navigate(`/apps/${col.id}`)
                }}
                onDoubleClick={() => startEditing(col.id, col.label)}
              >
                {col.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Add sheet button */}
      {siblings.length > 0 && (
        <div className="flex items-center border-l border-[#d4d4d4] px-1.5 h-full">
          <button
            type="button"
            className="p-1 hover:bg-[#d0d0d0] rounded-sm"
            aria-label="시트 추가"
            title="새 시트"
          >
            <Plus className="h-3.5 w-3.5 text-[#666]" />
          </button>
        </div>
      )}

      {/* Spacer + Status bar (right side, Excel-like) */}
      <div className="flex-1" />
      <div className="flex items-center gap-4 text-[#333] px-3 h-full">
        <span className="text-[#666]">준비</span>
        {statusBar}
      </div>
    </div>
  )
}
