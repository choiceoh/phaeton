import { useMemo } from 'react'
import { useParams } from 'react-router'
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
  LineChart,
  Line,
} from 'recharts'

import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import { useCollection } from '@/hooks/useCollections'
import { useAggregate, useCollectionCount } from '@/hooks/useEntries'
import type { Field } from '@/lib/types'

const COLORS = [
  '#1f2937', '#374151', '#4b5563', '#6b7280',
  '#9ca3af', '#d1d5db', '#111827', '#334155',
  '#475569', '#64748b', '#94a3b8', '#cbd5e1',
]

export default function DashboardPage() {
  const { appId } = useParams()
  const { data: collection, isLoading, isError, error } = useCollection(appId)

  if (isLoading) return <LoadingState variant="summary" />
  if (isError) return <ErrorState error={error} />
  if (!collection) return null

  const fields = collection.fields ?? []
  const selectFields = fields.filter((f) => f.field_type === 'select')
  const numericFields = fields.filter(
    (f) => f.field_type === 'number' || f.field_type === 'integer',
  )
  const dateField = fields.find(
    (f) => f.field_type === 'date' || f.field_type === 'datetime',
  )

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: '업무 목록', href: '/apps' },
          { label: collection.label, href: `/apps/${collection.id}` },
          { label: '대시보드' },
        ]}
        title="대시보드"
        description="데이터를 한눈에 요약합니다"
      />

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard slug={collection.slug} label="전체 건수" />
        {numericFields.slice(0, 3).map((f) => (
          <NumericSummaryCard
            key={f.id}
            slug={collection.slug}
            field={f}
          />
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {selectFields.map((sf) => (
          <ChartCard
            key={sf.id}
            slug={collection.slug}
            selectField={sf}
            numericField={numericFields[0]}
          />
        ))}
        {dateField && (
          <TimelineCard
            slug={collection.slug}
            dateField={dateField}
          />
        )}
      </div>
    </div>
  )
}

// -- Summary card: total count --
function SummaryCard({ slug, label }: { slug: string; label: string }) {
  const { data: count, isLoading } = useCollectionCount(slug)
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {isLoading ? '-' : (count ?? 0).toLocaleString('ko')}
      </div>
    </div>
  )
}

// -- Summary card: numeric field aggregate --
function NumericSummaryCard({ slug, field }: { slug: string; field: Field }) {
  const { data: sumData } = useAggregate(slug, {
    group: '_created_by',
    fn: 'sum',
    field: field.slug,
  })
  const { data: avgData } = useAggregate(slug, {
    group: '_created_by',
    fn: 'avg',
    field: field.slug,
  })

  const total = useMemo(
    () => sumData?.reduce((acc, r) => acc + r.value, 0) ?? 0,
    [sumData],
  )
  const avg = useMemo(
    () => {
      if (!avgData?.length) return 0
      return avgData.reduce((acc, r) => acc + r.value, 0) / avgData.length
    },
    [avgData],
  )

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">
        {field.label}
      </div>
      <div className="mt-1 text-2xl font-semibold">
        {total.toLocaleString('ko', { maximumFractionDigits: 0 })}
      </div>
      <div className="text-xs text-muted-foreground">
        평균 {avg.toLocaleString('ko', { maximumFractionDigits: 1 })}
      </div>
    </div>
  )
}

// -- Bar + Pie chart card for a select field --
function ChartCard({
  slug,
  selectField,
  numericField,
}: {
  slug: string
  selectField: Field
  numericField?: Field
}) {
  const { data: countData } = useAggregate(slug, {
    group: selectField.slug,
    fn: 'count',
  })
  const { data: sumData } = useAggregate(
    numericField ? slug : undefined,
    {
      group: selectField.slug,
      fn: 'sum',
      field: numericField?.slug ?? '',
    },
  )

  const barData = sumData?.length ? sumData : countData
  const barLabel = sumData?.length
    ? `${selectField.label} x ${numericField?.label} (합계)`
    : `${selectField.label} (건수)`

  if (!countData?.length) return null

  return (
    <>
      {/* Bar chart */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 text-sm font-medium">{barLabel}</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="group" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
            <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {(barData ?? []).map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie chart */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 text-sm font-medium">{selectField.label} 분포</div>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={countData}
              dataKey="value"
              nameKey="group"
              cx="50%"
              cy="50%"
              outerRadius={90}
              strokeWidth={1}
              stroke="#fff"
              label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {countData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6 }} formatter={(value: unknown) => Number(value).toLocaleString('ko')} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

// -- Timeline chart (entries over time) --
function TimelineCard({ slug, dateField }: { slug: string; dateField: Field }) {
  const { data } = useAggregate(slug, {
    group: dateField.slug,
    fn: 'count',
  })

  if (!data?.length || data.length < 2) return null

  // Sort by date
  const sorted = [...data].sort((a, b) => a.group.localeCompare(b.group))

  return (
    <div className="rounded-lg border bg-card p-4 md:col-span-2">
      <div className="mb-3 text-sm font-medium">
        {dateField.label} 기준 추이
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={sorted} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="group" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
          <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6 }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#1f2937"
            strokeWidth={2}
            dot={{ fill: '#1f2937', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
