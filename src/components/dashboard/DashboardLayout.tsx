'use client'

import { Text } from '@tremor/react'
import { useCallback, useRef, useState } from 'react'
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type LayoutItem,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout'

import { WidgetPalette } from '@/components/dashboard/WidgetPalette'
import { WidgetRenderer, type DashboardData } from '@/components/dashboard/WidgetRenderer'
import { WIDGET_REGISTRY, getDefaultLayout } from '@/lib/widgetRegistry'

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
  const [widgets, setWidgets] = useState<string[]>(savedConfig?.widgets || defaults.widgets)
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
      const maxY = lgItems.reduce((max, l) => Math.max(max, l.y + l.h), 0)
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
      <div className="mb-4 flex items-center justify-between">
        <Text className="text-lg font-semibold">대시보드</Text>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setShowPalette(true)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                + 위젯 추가
              </button>
              <button
                onClick={cancelEdit}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={saveLayout}
                disabled={!dirty}
                className="rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
              >
                저장
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              편집
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
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
            <div key={wId} className="group relative">
              {editing && (
                <div className="widget-drag-handle absolute left-0 right-0 top-0 z-10 flex h-7 cursor-move items-center justify-between rounded-t-md border-b border-gray-200 bg-gray-100 px-2">
                  <Text className="text-xs text-gray-500">
                    {WIDGET_REGISTRY[wId]?.label || wId}
                  </Text>
                  <button
                    onClick={() => removeWidget(wId)}
                    className="text-sm leading-none text-gray-400 hover:text-red-500"
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
