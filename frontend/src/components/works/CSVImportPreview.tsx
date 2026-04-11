import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { isLayoutType } from '@/lib/constants'
import { api } from '@/lib/api'
import type { Field } from '@/lib/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: File | null
  fields: Field[]
  slug: string
  onConfirm: (file: File, columnMap: Record<string, string>) => void
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/^\xef\xbb\xbf/, '').split('\n').filter((l) => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          result.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1, 11).map(parseLine) // preview first 10 rows
  return { headers, rows }
}

function isExcelFile(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.xlsx') || lower.endsWith('.xls')
}

const SKIP_VALUE = '__skip__'

export default function ImportPreview({
  open,
  onOpenChange,
  file,
  fields,
  slug,
  onConfirm,
}: Props) {
  const [previewData, setPreviewData] = useState<{ headers: string[]; rows: string[][] }>({
    headers: [],
    rows: [],
  })
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [sheetNames, setSheetNames] = useState<string[]>([])

  const editableFields = useMemo(
    () => fields.filter((f) => !isLayoutType(f.field_type) && f.field_type !== 'autonumber'),
    [fields],
  )

  // Auto-match headers to fields by label or slug.
  function autoMatch(headers: string[]) {
    const autoMap: Record<string, string> = {}
    for (const header of headers) {
      const lower = header.toLowerCase().trim()
      const match = editableFields.find(
        (f) => f.label.toLowerCase() === lower || f.slug.toLowerCase() === lower,
      )
      if (match) {
        autoMap[header] = match.slug
      }
    }
    setColumnMap(autoMap)
  }

  // Parse file when it changes.
  useEffect(() => {
    if (!file) return

    if (isExcelFile(file.name)) {
      // XLSX: use server-side preview endpoint.
      setLoading(true)
      const formData = new FormData()
      formData.append('file', file)
      api.uploadForm<{ headers: string[]; rows: string[][]; sheetNames: string[] }>(
        `/data/${slug}/import/preview`,
        formData,
      ).then((data) => {
        setPreviewData({ headers: data.headers || [], rows: data.rows || [] })
        setSheetNames(data.sheetNames || [])
        autoMatch(data.headers || [])
      }).catch(() => {
        setPreviewData({ headers: [], rows: [] })
      }).finally(() => {
        setLoading(false)
      })
    } else {
      // CSV: client-side parsing.
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const parsed = parseCSV(text)
        setPreviewData(parsed)
        setSheetNames([])
        autoMatch(parsed.headers)
      }
      reader.readAsText(file)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, slug])

  const mappedCount = Object.values(columnMap).filter((v) => v && v !== SKIP_VALUE).length
  const unmappedHeaders = previewData.headers.filter((h) => !columnMap[h] || columnMap[h] === SKIP_VALUE)
  const fileType = file && isExcelFile(file.name) ? 'Excel' : 'CSV'

  function handleConfirm() {
    if (!file) return
    // Filter out skipped mappings
    const finalMap: Record<string, string> = {}
    for (const [csvHeader, fieldSlug] of Object.entries(columnMap)) {
      if (fieldSlug && fieldSlug !== SKIP_VALUE) {
        finalMap[csvHeader] = fieldSlug
      }
    }
    onConfirm(file, finalMap)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fileType} 가져오기 미리보기</DialogTitle>
          <DialogDescription>
            {file?.name}
            {sheetNames.length > 1 && ` (${sheetNames.length}개 시트)`}
            {' — '}
            {loading ? '로딩 중...' : `${previewData.rows.length}행 미리보기 (최대 10행)`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Column mapping */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">컬럼 매핑</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {previewData.headers.map((header) => (
                  <div key={header} className="flex items-center gap-2">
                    <span className="w-32 truncate text-sm font-mono text-muted-foreground" title={header}>
                      {header}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Select
                      value={columnMap[header] || SKIP_VALUE}
                      onValueChange={(v) =>
                        setColumnMap((prev) => ({ ...prev, [header]: v ?? '' }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="건너뛰기" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP_VALUE}>
                          <span className="text-muted-foreground">건너뛰기</span>
                        </SelectItem>
                        {editableFields.map((f) => (
                          <SelectItem key={f.slug} value={f.slug}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {unmappedHeaders.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {unmappedHeaders.length}개 컬럼이 매핑되지 않았습니다 (건너뜀)
                </div>
              )}
            </div>

            {/* Data preview table */}
            {previewData.rows.length > 0 && (
              <div className="rounded-md border overflow-auto max-h-[250px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-xs">#</TableHead>
                      {previewData.headers.map((h) => (
                        <TableHead key={h} className="text-xs whitespace-nowrap">
                          {columnMap[h] && columnMap[h] !== SKIP_VALUE
                            ? editableFields.find((f) => f.slug === columnMap[h])?.label ?? h
                            : <span className="text-muted-foreground line-through">{h}</span>
                          }
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.rows.map((row, ri) => (
                      <TableRow key={ri}>
                        <TableCell className="text-xs text-muted-foreground">{ri + 1}</TableCell>
                        {row.map((cell, ci) => (
                          <TableCell
                            key={ci}
                            className={`text-xs ${
                              !columnMap[previewData.headers[ci]] || columnMap[previewData.headers[ci]] === SKIP_VALUE
                                ? 'text-muted-foreground/50'
                                : ''
                            }`}
                          >
                            {cell || '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={mappedCount === 0 || loading}>
            {mappedCount}개 컬럼 매핑으로 가져오기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
