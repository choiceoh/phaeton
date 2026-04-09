'use client'

import { useEffect, useRef, useState } from 'react'

import { PROJECT_COLUMNS, useColumnPrefs } from '@/lib/useColumnPrefs'

export function ColumnSettings() {
  const { visibleKeys, toggle, reset } = useColumnPrefs()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
          />
        </svg>
        컬럼 설정
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-20 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="border-b border-gray-100 px-3 py-1.5">
            <button
              type="button"
              onClick={reset}
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              기본값으로 초기화
            </button>
          </div>
          {PROJECT_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={visibleKeys.includes(col.key)}
                disabled={col.locked}
                onChange={() => toggle(col.key)}
                className="accent-stone-600"
              />
              <span className={col.locked ? 'text-gray-400' : 'text-gray-700'}>
                {col.label}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
