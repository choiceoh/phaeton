import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

import { useAggregate } from '@/hooks/useEntries'
import type { Field } from '@/lib/types'

const COLORS = [
  '#3b82f6', '#22c55e', '#a855f7', '#f97316',
  '#ec4899', '#14b8a6', '#eab308', '#06b6d4',
  '#8b5cf6', '#ef4444', '#84cc16', '#f59e0b',
]

interface ChartPanelProps {
  slug: string
  fields: Field[]
  totalRecords: number
}

export default function ChartPanel({ slug, fields, totalRecords }: ChartPanelProps) {
  const [expanded, setExpanded] = useState(true)

  // Auto-detect chartable fields
  const selectField = useMemo(
    () => fields.find((f) => f.field_type === 'select'),
    [fields],
  )
  const numericField = useMemo(
    () => fields.find((f) => f.field_type === 'number' || f.field_type === 'integer'),
    [fields],
  )

  const { data: selectAgg } = useAggregate(
    selectField ? slug : undefined,
    { group: selectField?.slug ?? '', fn: 'count' },
  )

  const { data: numericAgg } = useAggregate(
    numericField && selectField ? slug : undefined,
    {
      group: selectField?.slug ?? '',
      fn: 'sum',
      field: numericField?.slug ?? '',
    },
  )

  // Nothing to chart
  if (!selectAgg?.length && !numericAgg?.length) return null

  const barData = (numericAgg?.length ? numericAgg : selectAgg) ?? []
  const pieData = selectAgg ?? []

  const barLabel = numericAgg?.length
    ? `${selectField?.label} × ${numericField?.label} (합계)`
    : `${selectField?.label} (건수)`

  return (
    <div className="mb-6 rounded-lg border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          요약 차트
          <span className="text-xs text-muted-foreground">
            전체 {totalRecords.toLocaleString('ko')}건
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      <div
        className="grid grid-cols-1 gap-4 border-t px-4 md:grid-cols-2 overflow-hidden transition-all duration-200"
        style={{
          maxHeight: expanded ? 300 : 0,
          paddingTop: expanded ? 12 : 0,
          paddingBottom: expanded ? 16 : 0,
          opacity: expanded ? 1 : 0,
        }}
      >
          {/* Bar chart */}
          {barData.length > 0 && (
            <div role="img" aria-label={`${barLabel} 막대 차트`}>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {barLabel}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="group"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pie chart */}
          {pieData.length > 0 && (
            <div role="img" aria-label={`${selectField?.label} 분포 원형 차트`}>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {selectField?.label} 분포
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="group"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    minAngle={3}
                    strokeWidth={1}
                    stroke="#fff"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      (percent ?? 0) < 0.05
                        ? ''
                        : `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                    }}
                    formatter={(value: unknown) => Number(value).toLocaleString('ko')}
                  />
                  <Legend
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
    </div>
  )
}
