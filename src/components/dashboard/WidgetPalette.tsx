'use client'

import { Card, Text, Badge } from '@tremor/react'

import { WIDGET_REGISTRY, CATEGORY_LABELS, type WidgetDef } from '@/lib/widgetRegistry'

interface WidgetPaletteProps {
  activeWidgets: string[]
  onAdd: (widgetId: string) => void
  onRemove: (widgetId: string) => void
  onClose: () => void
}

export function WidgetPalette({ activeWidgets, onAdd, onRemove, onClose }: WidgetPaletteProps) {
  const grouped = Object.values(WIDGET_REGISTRY).reduce(
    (acc, w) => {
      if (!acc[w.category]) acc[w.category] = []
      acc[w.category].push(w)
      return acc
    },
    {} as Record<string, WidgetDef[]>,
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="h-full w-80 overflow-auto bg-white shadow-lg">
        <div className="sticky top-0 flex items-center justify-between border-b bg-white px-4 py-3">
          <Text className="text-lg font-semibold">위젯 추가</Text>
          <button
            onClick={onClose}
            className="text-xl leading-none text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        <div className="space-y-6 p-4">
          {Object.entries(grouped).map(([cat, widgets]) => (
            <div key={cat}>
              <Text className="mb-2 text-xs font-semibold uppercase text-gray-500">
                {CATEGORY_LABELS[cat] || cat}
              </Text>
              <div className="space-y-2">
                {widgets.map((w) => {
                  const isActive = activeWidgets.includes(w.id)
                  return (
                    <Card
                      key={w.id}
                      className={`cursor-pointer transition-colors ${
                        isActive ? 'border-blue-300 bg-blue-50' : 'hover:border-gray-300'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between"
                        onClick={() => (isActive ? onRemove(w.id) : onAdd(w.id))}
                      >
                        <div>
                          <Text className="text-sm font-medium">{w.label}</Text>
                          <Text className="text-xs text-gray-500">{w.description}</Text>
                        </div>
                        <Badge color={isActive ? 'blue' : 'gray'}>
                          {isActive ? '활성' : '추가'}
                        </Badge>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
