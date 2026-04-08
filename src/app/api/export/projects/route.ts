import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/constants'
import { getProjectExportRows } from '@/lib/queries'

import config from '@payload-config'

export const dynamic = 'force-dynamic'

const CSV_HEADERS = [
  '프로젝트 코드',
  '프로젝트명',
  '유형',
  '단계',
  '진행률(%)',
  '시작일',
  '목표일',
  'EPC금액(원)',
]

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return ''
  return value.toLocaleString('ko-KR')
}

export async function GET() {
  const payload = await getPayload({ config })

  // 인증 확인
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const rows = await getProjectExportRows(payload)

  // UTF-8 BOM for Korean characters in Excel
  const BOM = '\uFEFF'
  const headerLine = CSV_HEADERS.map(escapeCSV).join(',')
  const dataLines = rows.map((row) =>
    [
      escapeCSV(row.code || ''),
      escapeCSV(row.name || ''),
      escapeCSV(PROJECT_TYPE_LABELS[row.type] || row.type),
      escapeCSV(PROJECT_STATUS_LABELS[row.status] || row.status),
      row.progress_pct !== null && row.progress_pct !== undefined ? String(row.progress_pct) : '0',
      formatDate(row.created_at),
      formatDate(row.cod_target),
      formatNumber(row.epc_value),
    ].join(','),
  )

  const csv = BOM + [headerLine, ...dataLines].join('\r\n')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `phaeton-projects-${today}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
