import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { MILESTONE_STATUS_LABELS, CATEGORY_LABELS } from '@/lib/constants'

import config from '@payload-config'

export const dynamic = 'force-dynamic'

const CSV_HEADERS = [
  '프로젝트 코드',
  '프로젝트명',
  '마일스톤명',
  '카테고리',
  '상태',
  '순서',
  '예정일',
  '마감일',
  '완료일',
  '담당자',
]

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return dateStr.split('T')[0]
}

export async function GET() {
  const payload = await getPayload({ config })

  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const db = payload.db.drizzle
  const result = await db.execute(`
    SELECT
      p.code AS project_code,
      p.name AS project_name,
      pm.name AS milestone_name,
      mt.category,
      pm.status,
      pm.seq_order,
      pm.planned_date,
      pm.due_date,
      pm.actual_date,
      s.name AS assignee_name
    FROM project_milestones pm
    JOIN projects p ON p.id = pm.project_id
    LEFT JOIN milestone_templates mt ON mt.id = pm.template_id
    LEFT JOIN staff s ON s.id = pm.assignee_id
    ORDER BY p.code, pm.seq_order
  `)

  const rows = result.rows as {
    project_code: string
    project_name: string
    milestone_name: string
    category: string | null
    status: string
    seq_order: number
    planned_date: string | null
    due_date: string | null
    actual_date: string | null
    assignee_name: string | null
  }[]

  const BOM = '\uFEFF'
  const headerLine = CSV_HEADERS.map(escapeCSV).join(',')
  const dataLines = rows.map((r) =>
    [
      escapeCSV(r.project_code || ''),
      escapeCSV(r.project_name || ''),
      escapeCSV(r.milestone_name || ''),
      escapeCSV(r.category ? CATEGORY_LABELS[r.category] || r.category : ''),
      escapeCSV(MILESTONE_STATUS_LABELS[r.status] || r.status),
      String(r.seq_order || ''),
      formatDate(r.planned_date),
      formatDate(r.due_date),
      formatDate(r.actual_date),
      escapeCSV(r.assignee_name || ''),
    ].join(','),
  )

  const csv = BOM + [headerLine, ...dataLines].join('\r\n')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `phaeton-milestones-${today}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
