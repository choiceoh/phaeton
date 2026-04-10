import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Field } from '@/lib/types'

interface Props {
  dateField: Field
  fields: Field[]
  entries: Record<string, unknown>[]
  onEntryClick: (entry: Record<string, unknown>) => void
}

export default function CalendarView({ dateField, fields, entries, onEntryClick }: Props) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // Find a "title" field to display on each card (first text field).
  const titleField = useMemo(
    () => fields.find((f) => f.field_type === 'text'),
    [fields],
  )

  // Group entries by date string (YYYY-MM-DD).
  const entriesByDate = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>()
    for (const entry of entries) {
      const raw = entry[dateField.slug]
      if (!raw) continue
      const dateStr = String(raw).slice(0, 10) // YYYY-MM-DD
      const existing = map.get(dateStr) ?? []
      existing.push(entry)
      map.set(dateStr, existing)
    }
    return map
  }, [entries, dateField.slug])

  // Generate calendar grid.
  const firstDayOfMonth = new Date(year, month, 1)
  const startDay = firstDayOfMonth.getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const calendarDays: (number | null)[] = []
  for (let i = 0; i < startDay; i++) calendarDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d)
  // Pad to complete last week.
  while (calendarDays.length % 7 !== 0) calendarDays.push(null)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7))
  }

  const today = new Date()
  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1))
  }

  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1))
  }

  function goToday() {
    setViewDate(new Date())
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold">
            {year}년 {month + 1}월
          </h3>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={goToday}>
          오늘
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-md border">
        <div className="grid grid-cols-7">
          {dayNames.map((name, i) => (
            <div
              key={name}
              className={`border-b px-2 py-1.5 text-center text-xs font-medium ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'
              }`}
            >
              {name}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              if (day === null) {
                return <div key={di} className="min-h-[100px] border-b border-r bg-muted/20" />
              }
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayEntries = entriesByDate.get(dateStr) ?? []
              return (
                <div
                  key={di}
                  className={`min-h-[100px] border-b border-r p-1 ${
                    isToday(day) ? 'bg-primary/5' : ''
                  }`}
                >
                  <div
                    className={`mb-1 text-xs font-medium ${
                      di === 0 ? 'text-red-500' : di === 6 ? 'text-blue-500' : ''
                    } ${isToday(day) ? 'rounded-full bg-primary text-primary-foreground w-5 h-5 flex items-center justify-center' : ''}`}
                  >
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayEntries.slice(0, 3).map((entry) => {
                      const label =
                        titleField
                          ? String(entry[titleField.slug] ?? '')
                          : String(entry.id ?? '').slice(0, 8)
                      return (
                        <button
                          key={String(entry.id)}
                          type="button"
                          className="block w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-xs hover:bg-primary/20"
                          onClick={() => onEntryClick(entry)}
                        >
                          {label || '(무제)'}
                        </button>
                      )
                    })}
                    {dayEntries.length > 3 && (
                      <span className="text-[10px] text-muted-foreground pl-1">
                        +{dayEntries.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
