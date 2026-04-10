import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Field } from '@/lib/types'

const DAY_WIDTH = 36
const ROW_HEIGHT = 36
const HEADER_HEIGHT = 52
const LEFT_PANEL_WIDTH = 420
const BAR_HEIGHT = 22
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2

interface Props {
  fields: Field[]
  entries: Record<string, unknown>[]
  onEntryClick: (entry: Record<string, unknown>) => void
  onEntryUpdate?: (entryId: string, updates: Record<string, unknown>) => void
}

function toDateStr(v: unknown): string | null {
  if (!v) return null
  const s = String(v).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

export default function GanttView({ fields, entries, onEntryClick, onEntryUpdate }: Props) {
  // Auto-detect fields
  const dateFields = useMemo(
    () => fields.filter((f) => f.field_type === 'date' || f.field_type === 'datetime'),
    [fields],
  )
  const startDateField = dateFields[0]
  const endDateField = dateFields.length >= 2 ? dateFields[1] : dateFields[0]

  const titleField = useMemo(
    () => fields.find((f) => f.field_type === 'text'),
    [fields],
  )

  const userField = useMemo(
    () => fields.find((f) => f.field_type === 'user'),
    [fields],
  )

  const progressField = useMemo(
    () =>
      fields.find(
        (f) =>
          (f.field_type === 'number' || f.field_type === 'integer') &&
          (f.options?.display_type === 'progress' ||
            f.slug.includes('progress') ||
            f.label.includes('진행')),
      ),
    [fields],
  )

  const relationField = useMemo(
    () => fields.find((f) => f.field_type === 'relation'),
    [fields],
  )

  // Parse entries into rows
  const rows = useMemo(() => {
    return entries.map((entry) => {
      const startStr = toDateStr(entry[startDateField?.slug ?? ''])
      const endStr = toDateStr(entry[endDateField?.slug ?? ''])
      const title = titleField
        ? String(entry[titleField.slug] ?? '')
        : String(entry.id ?? '').slice(0, 8)
      const user = userField ? entry[userField.slug] : null
      const progress = progressField ? Number(entry[progressField.slug] ?? 0) : null

      // Get related IDs for dependencies
      let dependencyIds: string[] = []
      if (relationField) {
        const relVal = entry[relationField.slug]
        if (Array.isArray(relVal)) {
          dependencyIds = relVal.map((v: unknown) =>
            typeof v === 'object' && v !== null
              ? String((v as Record<string, unknown>).id ?? v)
              : String(v),
          )
        } else if (relVal && typeof relVal === 'object') {
          dependencyIds = [String((relVal as Record<string, unknown>).id ?? '')]
        } else if (relVal) {
          dependencyIds = [String(relVal)]
        }
      }

      return {
        id: String(entry.id),
        entry,
        title: title || '(무제)',
        startDate: startStr,
        endDate: endStr || startStr,
        user:
          typeof user === 'object' && user !== null
            ? String((user as Record<string, unknown>).name ?? '')
            : user
              ? String(user)
              : '',
        progress,
        dependencyIds,
      }
    })
  }, [entries, startDateField, endDateField, titleField, userField, progressField, relationField])

  // Calculate date range
  const { rangeStart, totalDays } = useMemo(() => {
    const dates: Date[] = []
    for (const row of rows) {
      if (row.startDate) dates.push(parseDate(row.startDate))
      if (row.endDate) dates.push(parseDate(row.endDate))
    }
    if (dates.length === 0) {
      const today = new Date()
      return { rangeStart: addDays(today, -7), totalDays: 37 }
    }
    const min = new Date(Math.min(...dates.map((d) => d.getTime())))
    const max = new Date(Math.max(...dates.map((d) => d.getTime())))
    const rs = addDays(min, -7)
    const re = addDays(max, 14)
    return { rangeStart: rs, totalDays: diffDays(rs, re) + 1 }
  }, [rows])

  // Generate day columns
  const days = useMemo(() => {
    const result: Date[] = []
    for (let i = 0; i < totalDays; i++) {
      result.push(addDays(rangeStart, i))
    }
    return result
  }, [rangeStart, totalDays])

  // Generate month headers
  const monthHeaders = useMemo(() => {
    const headers: { label: string; startIdx: number; span: number }[] = []
    let currentMonth = -1
    let currentYear = -1
    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) {
        currentMonth = d.getMonth()
        currentYear = d.getFullYear()
        headers.push({
          label: `${currentYear}년 ${currentMonth + 1}월`,
          startIdx: i,
          span: 1,
        })
      } else {
        headers[headers.length - 1].span++
      }
    }
    return headers
  }, [days])

  // Synchronized scrolling
  const leftBodyRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const scrollingRef = useRef<'left' | 'right' | null>(null)

  const handleRightScroll = useCallback(() => {
    if (scrollingRef.current === 'left') return
    scrollingRef.current = 'right'
    if (rightPanelRef.current && leftBodyRef.current) {
      leftBodyRef.current.scrollTop = rightPanelRef.current.scrollTop
    }
    requestAnimationFrame(() => {
      scrollingRef.current = null
    })
  }, [])

  const handleLeftScroll = useCallback(() => {
    if (scrollingRef.current === 'right') return
    scrollingRef.current = 'left'
    if (leftBodyRef.current && rightPanelRef.current) {
      rightPanelRef.current.scrollTop = leftBodyRef.current.scrollTop
    }
    requestAnimationFrame(() => {
      scrollingRef.current = null
    })
  }, [])

  // Drag state
  const [dragState, setDragState] = useState<{
    rowId: string
    type: 'move' | 'resize-start' | 'resize-end'
    startX: number
    origStart: string
    origEnd: string
    dayDelta: number
  } | null>(null)

  const handleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      rowId: string,
      type: 'move' | 'resize-start' | 'resize-end',
      startDate: string,
      endDate: string,
    ) => {
      e.preventDefault()
      e.stopPropagation()
      setDragState({
        rowId,
        type,
        startX: e.clientX,
        origStart: startDate,
        origEnd: endDate,
        dayDelta: 0,
      })
    },
    [],
  )

  useEffect(() => {
    if (!dragState) return

    function handleMouseMove(e: MouseEvent) {
      if (!dragState) return
      const dx = e.clientX - dragState.startX
      const dayDelta = Math.round(dx / DAY_WIDTH)
      setDragState((prev) => (prev ? { ...prev, dayDelta } : null))
    }

    function handleMouseUp(e: MouseEvent) {
      if (!dragState) return
      const dx = e.clientX - dragState.startX
      const dayDelta = Math.round(dx / DAY_WIDTH)

      if (dayDelta !== 0 && onEntryUpdate && startDateField) {
        const origStart = parseDate(dragState.origStart)
        const origEnd = parseDate(dragState.origEnd)
        let newStart: Date
        let newEnd: Date

        switch (dragState.type) {
          case 'move':
            newStart = addDays(origStart, dayDelta)
            newEnd = addDays(origEnd, dayDelta)
            break
          case 'resize-start':
            newStart = addDays(origStart, dayDelta)
            newEnd = origEnd
            if (newStart > newEnd) newStart = newEnd
            break
          case 'resize-end':
            newStart = origStart
            newEnd = addDays(origEnd, dayDelta)
            if (newEnd < newStart) newEnd = newStart
            break
        }

        const updates: Record<string, unknown> = {
          [startDateField.slug]: formatDateStr(newStart!),
        }
        if (endDateField && endDateField.id !== startDateField.id) {
          updates[endDateField.slug] = formatDateStr(newEnd!)
        }
        onEntryUpdate(dragState.rowId, updates)
      }
      setDragState(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, onEntryUpdate, startDateField, endDateField])

  // Today indicator
  const todayStr = formatDateStr(new Date())
  const todayIdx = days.findIndex((d) => formatDateStr(d) === todayStr)

  // Build entry position map for dependencies
  const entryPositions = useMemo(() => {
    const map = new Map<string, { rowIdx: number; startIdx: number; endIdx: number }>()
    rows.forEach((row, rowIdx) => {
      if (!row.startDate || !row.endDate) return
      const startIdx = diffDays(rangeStart, parseDate(row.startDate))
      const endIdx = diffDays(rangeStart, parseDate(row.endDate))
      map.set(row.id, { rowIdx, startIdx, endIdx })
    })
    return map
  }, [rows, rangeStart])

  // Dependency lines
  const dependencies = useMemo(() => {
    const lines: { fromX: number; fromY: number; toX: number; toY: number }[] = []
    for (const row of rows) {
      if (row.dependencyIds.length === 0) continue
      const fromPos = entryPositions.get(row.id)
      if (!fromPos) continue
      for (const depId of row.dependencyIds) {
        const toPos = entryPositions.get(depId)
        if (!toPos) continue
        lines.push({
          fromX: (fromPos.endIdx + 1) * DAY_WIDTH,
          fromY: fromPos.rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2,
          toX: toPos.startIdx * DAY_WIDTH,
          toY: toPos.rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2,
        })
      }
    }
    return lines
  }, [rows, entryPositions])

  // Scroll to today on mount
  useEffect(() => {
    if (todayIdx >= 0 && rightPanelRef.current) {
      const scrollLeft = Math.max(0, todayIdx * DAY_WIDTH - rightPanelRef.current.clientWidth / 3)
      rightPanelRef.current.scrollLeft = scrollLeft
    }
  }, [todayIdx])

  const timelineWidth = totalDays * DAY_WIDTH
  const bodyHeight = rows.length * ROW_HEIGHT

  // Compute bar position with drag delta applied
  function getBarPosition(row: (typeof rows)[number]) {
    if (!row.startDate || !row.endDate) return null
    let sDate = parseDate(row.startDate)
    let eDate = parseDate(row.endDate)

    if (dragState && dragState.rowId === row.id && dragState.dayDelta !== 0) {
      switch (dragState.type) {
        case 'move':
          sDate = addDays(sDate, dragState.dayDelta)
          eDate = addDays(eDate, dragState.dayDelta)
          break
        case 'resize-start':
          sDate = addDays(sDate, dragState.dayDelta)
          if (sDate > eDate) sDate = eDate
          break
        case 'resize-end':
          eDate = addDays(eDate, dragState.dayDelta)
          if (eDate < sDate) eDate = sDate
          break
      }
    }

    const startIdx = diffDays(rangeStart, sDate)
    const endIdx = diffDays(rangeStart, eDate)
    return {
      left: startIdx * DAY_WIDTH + 2,
      width: Math.max((endIdx - startIdx + 1) * DAY_WIDTH - 4, 8),
    }
  }

  return (
    <div
      className="flex rounded-md border overflow-hidden"
      style={{ height: 'calc(100vh - 320px)', minHeight: 400 }}
    >
      {/* Left panel */}
      <div
        className="flex flex-col flex-shrink-0 border-r"
        style={{ width: LEFT_PANEL_WIDTH }}
      >
        {/* Left header */}
        <div
          className="flex border-b bg-muted/30"
          style={{ height: HEADER_HEIGHT, minHeight: HEADER_HEIGHT }}
        >
          <div className="flex-1 px-3 flex items-center text-xs font-medium">제목</div>
          <div className="w-[80px] px-2 flex items-center text-xs font-medium border-l">
            시작일
          </div>
          <div className="w-[80px] px-2 flex items-center text-xs font-medium border-l">
            종료일
          </div>
          {userField && (
            <div className="w-[64px] px-2 flex items-center text-xs font-medium border-l">
              담당자
            </div>
          )}
          {progressField && (
            <div className="w-[56px] px-2 flex items-center text-xs font-medium border-l">
              진행률
            </div>
          )}
        </div>
        {/* Left body */}
        <div
          ref={leftBodyRef}
          className="overflow-y-auto overflow-x-hidden flex-1"
          onScroll={handleLeftScroll}
          style={{ scrollbarWidth: 'none' }}
        >
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex border-b hover:bg-muted/20 cursor-pointer"
              style={{ height: ROW_HEIGHT }}
              onClick={() => onEntryClick(row.entry)}
            >
              <div className="flex-1 px-3 flex items-center text-sm truncate">
                {row.title}
              </div>
              <div className="w-[80px] px-2 flex items-center text-xs text-muted-foreground border-l">
                {row.startDate
                  ? `${parseDate(row.startDate).getMonth() + 1}/${parseDate(row.startDate).getDate()}`
                  : '-'}
              </div>
              <div className="w-[80px] px-2 flex items-center text-xs text-muted-foreground border-l">
                {row.endDate
                  ? `${parseDate(row.endDate).getMonth() + 1}/${parseDate(row.endDate).getDate()}`
                  : '-'}
              </div>
              {userField && (
                <div className="w-[64px] px-2 flex items-center text-xs text-muted-foreground border-l truncate">
                  {row.user || '-'}
                </div>
              )}
              {progressField && (
                <div className="w-[56px] px-2 flex items-center text-xs border-l">
                  {row.progress !== null ? (
                    <div className="flex items-center gap-1 w-full">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(100, Math.max(0, row.progress))}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {row.progress}%
                      </span>
                    </div>
                  ) : (
                    '-'
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - timeline */}
      <div
        ref={rightPanelRef}
        className="flex-1 overflow-auto"
        onScroll={handleRightScroll}
      >
        <div style={{ width: timelineWidth, minWidth: '100%' }}>
          {/* Timeline header */}
          <div
            className="sticky top-0 z-10 bg-background border-b"
            style={{ height: HEADER_HEIGHT }}
          >
            {/* Month row */}
            <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
              {monthHeaders.map((mh) => (
                <div
                  key={`${mh.label}-${mh.startIdx}`}
                  className="border-r border-b flex items-center justify-center text-xs font-medium"
                  style={{ width: mh.span * DAY_WIDTH }}
                >
                  {mh.label}
                </div>
              ))}
            </div>
            {/* Day row */}
            <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
              {days.map((d, i) => {
                const dow = d.getDay()
                const isWeekend = dow === 0 || dow === 6
                const isT = formatDateStr(d) === todayStr
                return (
                  <div
                    key={i}
                    className={`border-r flex items-center justify-center text-[10px] ${
                      isT
                        ? 'bg-primary text-primary-foreground font-bold'
                        : isWeekend
                          ? 'text-muted-foreground bg-muted/30'
                          : ''
                    }`}
                    style={{ width: DAY_WIDTH }}
                  >
                    {d.getDate()}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Timeline body */}
          <div className="relative" style={{ height: bodyHeight }}>
            {/* Weekend/today background columns */}
            {days.map((d, i) => {
              const dow = d.getDay()
              const isWeekend = dow === 0 || dow === 6
              const isT = formatDateStr(d) === todayStr
              if (!isWeekend && !isT) return null
              return (
                <div
                  key={i}
                  className={`absolute top-0 ${isT ? 'bg-primary/5' : 'bg-muted/20'}`}
                  style={{
                    left: i * DAY_WIDTH,
                    width: DAY_WIDTH,
                    height: bodyHeight,
                  }}
                />
              )
            })}

            {/* Row gridlines */}
            {rows.map((_, i) => (
              <div
                key={i}
                className="absolute w-full border-b"
                style={{ top: (i + 1) * ROW_HEIGHT - 1 }}
              />
            ))}

            {/* Today line */}
            {todayIdx >= 0 && (
              <div
                className="absolute top-0 w-[2px] bg-primary z-10"
                style={{
                  left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2,
                  height: bodyHeight,
                }}
              />
            )}

            {/* Bars */}
            {rows.map((row, rowIdx) => {
              const pos = getBarPosition(row)
              if (!pos) return null
              const barTop = rowIdx * ROW_HEIGHT + BAR_Y_OFFSET
              const isDragging = dragState?.rowId === row.id

              return (
                <div
                  key={row.id}
                  className="absolute rounded group"
                  style={{
                    left: pos.left,
                    top: barTop,
                    width: pos.width,
                    height: BAR_HEIGHT,
                    opacity: isDragging ? 0.8 : 1,
                  }}
                >
                  {/* Bar background */}
                  <div
                    className="absolute inset-0 rounded bg-primary/20 cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) =>
                      onEntryUpdate &&
                      row.startDate &&
                      row.endDate &&
                      handleMouseDown(e, row.id, 'move', row.startDate, row.endDate)
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!dragState) onEntryClick(row.entry)
                    }}
                  >
                    {/* Progress fill */}
                    {row.progress !== null && row.progress > 0 && (
                      <div
                        className={`absolute inset-y-0 left-0 bg-primary/50 ${
                          row.progress >= 100 ? 'rounded' : 'rounded-l'
                        }`}
                        style={{
                          width: `${Math.min(100, row.progress)}%`,
                        }}
                      />
                    )}
                    {/* Bar label */}
                    <span className="absolute inset-0 flex items-center px-2 text-xs truncate font-medium">
                      {row.title}
                    </span>
                  </div>

                  {/* Resize handles */}
                  {onEntryUpdate && row.startDate && row.endDate && (
                    <>
                      <div
                        className="absolute left-0 top-0 w-2 h-full cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-primary/40 rounded-l"
                        onMouseDown={(e) =>
                          handleMouseDown(
                            e,
                            row.id,
                            'resize-start',
                            row.startDate!,
                            row.endDate!,
                          )
                        }
                      />
                      <div
                        className="absolute right-0 top-0 w-2 h-full cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-primary/40 rounded-r"
                        onMouseDown={(e) =>
                          handleMouseDown(
                            e,
                            row.id,
                            'resize-end',
                            row.startDate!,
                            row.endDate!,
                          )
                        }
                      />
                    </>
                  )}
                </div>
              )
            })}

            {/* Dependency arrows (SVG overlay) */}
            {dependencies.length > 0 && (
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{ width: timelineWidth, height: bodyHeight }}
              >
                <defs>
                  <marker
                    id="gantt-arrow"
                    markerWidth="6"
                    markerHeight="6"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path
                      d="M0,0 L6,3 L0,6 Z"
                      fill="currentColor"
                      className="text-muted-foreground"
                    />
                  </marker>
                </defs>
                {dependencies.map((dep, i) => {
                  const midX = (dep.fromX + dep.toX) / 2
                  return (
                    <path
                      key={i}
                      d={`M${dep.fromX},${dep.fromY} C${midX},${dep.fromY} ${midX},${dep.toY} ${dep.toX},${dep.toY}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-muted-foreground/50"
                      markerEnd="url(#gantt-arrow)"
                    />
                  )
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
