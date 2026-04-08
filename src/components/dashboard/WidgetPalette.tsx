'use client'

import { Card, Text, Badge } from '@tremor/react'

import { WIDGET_REGISTRY, CATEGORY_LABELS, type WidgetDef } from '@/lib/widgetRegistry'

interface WidgetPaletteProps {
  activeWidgets: string[]
  onAdd: (widgetId: string) => void
  onRemove: (widgetId: string) => void
  onClose: () => void
}

export function WidgetPalette({
  activeWidgets,
  onAdd,
  onRemove,
  onClose,
}: WidgetPaletteProps) {
  const grouped = Object.values(WIDGET_REGISTRY).reduce(
    (acc, w) => {
      if (!acc[w.category]) acc[w.category] = []
      acc[w.category].push(w)
      return acc
    },
    {} as Record<string, WidgetDef[]>,
  )

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end">
      <div className="w-80 bg-white h-full shadow-lg overflow-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
          <Text className="font-semibold text-lg">위젯 추가</Text>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-6">
          {Object.entries(grouped).map(([cat, widgets]) => (
            <div key={cat}>
              <Text className="text-xs font-semibold text-gray-500 uppercase mb-2">
                {CATEGORY_LABELS[cat] || cat}
              </Text>
              <div className="space-y-2">
                {widgets.map((w) => {
                  const isActive = activeWidgets.includes(w.id)
                  return (
                    <Card
                      key={w.id}
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? 'border-blue-300 bg-blue-50'
                          : 'hover:border-gray-300'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between"
                        onClick={() => (isActive ? onRemove(w.id) : onAdd(w.id))}
                      >
                        <div>
                          <Text className="font-medium text-sm">{w.label}</Text>
                          <Text className="text-xs text-gray-500">
                            {w.description}
                          </Text>
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
