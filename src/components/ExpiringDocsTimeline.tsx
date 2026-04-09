'use client'

import { Badge, Card, Text, Tracker } from '@tremor/react'
import Link from 'next/link'

import { DOC_TYPE_LABELS } from '@/lib/constants'
import type { ExpiringDocument } from '@/lib/types'

function getWeekLabel(start: Date): string {
  const mm = String(start.getMonth() + 1).padStart(2, '0')
  const dd = String(start.getDate()).padStart(2, '0')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const mm2 = String(end.getMonth() + 1).padStart(2, '0')
  const dd2 = String(end.getDate()).padStart(2, '0')
  return `${mm}/${dd}~${mm2}/${dd2}`
}

export function ExpiringDocsTimeline({ documents }: { documents: ExpiringDocument[] }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build 90-day tracker data
  const dayMap = new Map<string, number>()
  for (const doc of documents) {
    const key = doc.expiry_date.split('T')[0]
    dayMap.set(key, (dayMap.get(key) || 0) + 1)
  }

  const trackerData: { color: string; tooltip: string }[] = []
  for (let i = 0; i < 90; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().split('T')[0]
    const count = dayMap.get(key) || 0
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    trackerData.push({
      color: count === 0 ? 'stone' : count === 1 ? 'amber' : 'red',
      tooltip: `${mm}/${dd}: ${count}건 만료`,
    })
  }

  // Group by week
  const weeks: { label: string; docs: ExpiringDocument[] }[] = []
  for (let w = 0; w < 13; w++) {
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() + w * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const weekDocs = documents.filter((doc) => {
      const d = new Date(doc.expiry_date)
      return d >= weekStart && d < weekEnd
    })

    if (weekDocs.length > 0) {
      weeks.push({ label: getWeekLabel(weekStart), docs: weekDocs })
    }
  }

  return (
    <Card className="h-full overflow-auto">
      <Text className="mb-4 font-medium">서류 만료 캘린더 (90일)</Text>
      {documents.length > 0 ? (
        <>
          <Tracker data={trackerData} className="mb-4" />
          <div className="space-y-3">
            {weeks.map((w) => (
              <div key={w.label}>
                <Text className="mb-1 text-xs font-medium text-stone-500">{w.label}</Text>
                <div className="space-y-1">
                  {w.docs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/projects/${d.project_id}`}
                          className="text-stone-700 hover:underline"
                        >
                          {d.title}
                        </Link>
                        <Badge color="gray" size="xs">
                          {DOC_TYPE_LABELS[d.doc_type] || d.doc_type}
                        </Badge>
                      </div>
                      <Badge color="amber" size="xs">
                        {d.days_until_expiry}일 남음
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Text className="py-8 text-center text-sm text-stone-400">만료 임박 서류 없음</Text>
      )}
    </Card>
  )
}
