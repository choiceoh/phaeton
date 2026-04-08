'use client'

import { useCallback, useRef, useState } from 'react'
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type LayoutItem,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout'
import { Text } from '@tremor/react'

import { WIDGET_REGISTRY, getDefaultLayout } from '@/lib/widgetRegistry'
import { WidgetPalette } from '@/components/dashboard/WidgetPalette'
import { WidgetRenderer, type DashboardData } from '@/components/dashboard/WidgetRenderer'

import 'react-grid-layout/css/styles.css'

interface DashboardLayoutProps {
  data: DashboardData
  userId: number
  savedConfig: {
    id?: number
    layouts?: ResponsiveLayouts
    widgets?: string[]
  } | null
}

export function DashboardLayout({ data, userId, savedConfig }: DashboardLayoutProps) {
  const defaults = getDefaultLayout()
  const [widgets, setWidgets] = useState<string[]>(
    savedConfig?.widgets || defaults.widgets,
  )
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(
    savedConfig?.layouts || defaults.layouts,
  )
  const [editing, setEditing] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [dirty, setDirty] = useState(false)
  const configId = useRef(savedConfig?.id)
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 })

  const handleLayoutChange = useCallback(
    (_current: Layout, allLayouts: ResponsiveLayouts) => {
      setLayouts(allLayouts)
      if (editing) setDirty(true)
    },
    [editing],
  )

  const addWidget = useCallback(
    (widgetId: string) => {
      if (widgets.includes(widgetId)) return
      const def = WIDGET_REGISTRY[widgetId]
      if (!def) return

      const lgItems = layouts.lg || []
      const maxY = lgItems.reduce(
        (max, l) => Math.max(max, l.y + l.h),
        0,
      )
      const newItem: LayoutItem = {
        i: widgetId,
        x: 0,
        y: maxY,
        w: def.defaultW,
        h: def.defaultH,
        minW: def.minW,
        minH: def.minH,
        ...(def.maxW ? { maxW: def.maxW } : {}),
        ...(def.maxH ? { maxH: def.maxH } : {}),
      }
      setWidgets((prev) => [...prev, widgetId])
      setLayouts((prev) => ({
        ...prev,
        lg: [...(prev.lg || []), newItem],
      }))
      setDirty(true)
    },
    [widgets, layouts],
  )

  const removeWidget = useCallback((widgetId: string) => {
    setWidgets((prev) => prev.filter((w) => w !== widgetId))
    setLayouts((prev) => {
      const next: ResponsiveLayouts = {}
      for (const [bp, items] of Object.entries(prev)) {
        next[bp] = (items as LayoutItem[]).filter((l) => l.i !== widgetId)
      }
      return next
    })
    setDirty(true)
  }, [])

  const saveLayout = useCallback(async () => {
    const body = {
      name: '내 대시보드',
      user: userId,
      layouts,
      widgets,
      isDefault: true,
    }

    const url = configId.current
      ? `/api/dashboard-configs/${configId.current}`
      : '/api/dashboard-configs'

    const res = await fetch(url, {
      method: configId.current ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const result = await res.json()
      configId.current = result.doc?.id || result.id
      setDirty(false)
      setEditing(false)
    }
  }, [layouts, widgets, userId])

  const cancelEdit = useCallback(() => {
    if (savedConfig) {
      setLayouts(savedConfig.layouts || defaults.layouts)
      setWidgets(savedConfig.widgets || defaults.widgets)
    }
    setDirty(false)
    setEditing(false)
    setShowPalette(false)
  }, [savedConfig, defaults])

  const currentLayouts: ResponsiveLayouts = {}
  for (const [bp, items] of Object.entries(layouts)) {
    currentLayouts[bp] = (items as LayoutItem[]).map((l) => {
      const def = WIDGET_REGISTRY[l.i]
      if (!def) return l
      return {
        ...l,
        minW: def.minW,
        minH: def.minH,
        ...(def.maxW ? { maxW: def.maxW } : {}),
        ...(def.maxH ? { maxH: def.maxH } : {}),
        static: !editing,
      }
    })
  }

  return (
    <div ref={containerRef}>
      <div className="flex items-center justify-between mb-4">
        <Text className="text-lg font-semibold">대시보드</Text>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setShowPalette(true)}
                className="px-3 py-1.5 text-sm bg-white border border-gray-300
                  rounded-md hover:bg-gray-50"
              >
                + 위젯 추가
              </button>
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-sm bg-white border border-gray-300
                  rounded-md hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={saveLayout}
                disabled={!dirty}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white
                  rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                저장
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300
                rounded-md hover:bg-gray-50"
            >
              편집
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
          <Text className="text-sm text-blue-700">
            위젯을 드래그하여 위치를 변경하고, 모서리를 끌어 크기를 조절하세요.
          </Text>
        </div>
      )}

      {mounted && (
        <ResponsiveGridLayout
          className="layout"
          width={width}
          layouts={currentLayouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
          rowHeight={80}
          margin={[16, 16]}
          onLayoutChange={handleLayoutChange}
          dragConfig={{
            enabled: editing,
            handle: '.widget-drag-handle',
            bounded: false,
            threshold: 3,
          }}
          resizeConfig={{
            enabled: editing,
            handles: ['se'],
          }}
        >
          {widgets.map((wId) => (
            <div key={wId} className="relative group">
              {editing && (
                <div
                  className="widget-drag-handle absolute top-0 left-0 right-0 h-7
                    bg-gray-100 border-b border-gray-200 flex items-center
                    justify-between px-2 cursor-move z-10 rounded-t-md"
                >
                  <Text className="text-xs text-gray-500">
                    {WIDGET_REGISTRY[wId]?.label || wId}
                  </Text>
                  <button
                    onClick={() => removeWidget(wId)}
                    className="text-gray-400 hover:text-red-500 text-sm leading-none"
                  >
                    &times;
                  </button>
                </div>
              )}
              <div className={`h-full overflow-auto ${editing ? 'pt-7' : ''}`}>
                <WidgetRenderer widgetId={wId} data={data} />
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {showPalette && (
        <WidgetPalette
          activeWidgets={widgets}
          onAdd={addWidget}
          onRemove={removeWidget}
          onClose={() => setShowPalette(false)}
        />
      )}
    </div>
  )
}
