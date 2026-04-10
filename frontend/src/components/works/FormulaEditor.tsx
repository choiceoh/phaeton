import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import type { Field } from '@/lib/types'

interface FormulaPreviewResult {
  valid: boolean
  error: string
  sql: string
  refs: string[]
  samples: unknown[]
}

interface Props {
  expression: string
  resultType: string
  precision?: number
  slug: string | undefined
  fields: Field[]
  onChange: (expression: string) => void
  onResultTypeChange: (resultType: string) => void
  onPrecisionChange: (precision: number | undefined) => void
}

const RESULT_TYPES = [
  { value: 'number', label: '숫자' },
  { value: 'integer', label: '정수' },
  { value: 'text', label: '텍스트' },
  { value: 'boolean', label: '불리언' },
  { value: 'date', label: '날짜' },
]

const FORMULA_HELP = [
  { label: '산술', examples: '+ - * / %' },
  { label: '함수', examples: 'SUM, AVG, MIN, MAX, COUNT, ROUND, ABS, COALESCE' },
  { label: '조건', examples: 'IF(조건, 참, 거짓)' },
]

export default function FormulaEditor({
  expression,
  resultType,
  precision,
  slug,
  fields,
  onChange,
  onResultTypeChange,
  onPrecisionChange,
}: Props) {
  const [preview, setPreview] = useState<FormulaPreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Available field slugs for autocomplete hint.
  const dataFields = fields.filter(
    (f) => !['label', 'line', 'spacer', 'formula'].includes(f.field_type),
  )

  const fetchPreview = useCallback(
    async (expr: string) => {
      if (!slug || !expr.trim()) {
        setPreview(null)
        return
      }
      setLoading(true)
      try {
        const result = await api.post<FormulaPreviewResult>(
          `/data/${slug}/formula-preview`,
          { expression: expr, result_type: resultType },
          { raw: true },
        )
        setPreview(result)
      } catch {
        setPreview(null)
      } finally {
        setLoading(false)
      }
    },
    [slug, resultType],
  )

  // Debounced preview on expression change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPreview(expression), 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [expression, fetchPreview])

  return (
    <div className="space-y-3">
      {/* Expression input */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground">수식</Label>
        <Input
          value={expression}
          onChange={(e) => onChange(e.target.value)}
          placeholder="=price * quantity"
          className="font-mono text-sm"
        />
      </div>

      {/* Result type */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground">결과 유형</Label>
        <Select value={resultType || 'number'} onValueChange={(v) => v && onResultTypeChange(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESULT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Precision (for number result type) */}
      {(resultType === 'number') && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground">소수점 자릿수</Label>
          <Input
            type="number"
            min={0}
            max={10}
            value={precision ?? ''}
            onChange={(e) => onPrecisionChange(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="자동"
          />
        </div>
      )}

      {/* Available fields */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground">사용 가능한 필드</Label>
        <div className="flex flex-wrap gap-1">
          {dataFields.map((f) => (
            <button
              key={f.id}
              type="button"
              className="rounded border px-1.5 py-0.5 text-xs font-mono hover:bg-accent"
              onClick={() => {
                const pos = expression.length
                const before = pos > 0 && expression[pos - 1] !== ' ' ? ' ' : ''
                onChange(expression + before + f.slug)
              }}
            >
              {f.slug}
            </button>
          ))}
        </div>
      </div>

      {/* Preview result */}
      {preview && (
        <div className="rounded-md border bg-muted/30 p-2 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={preview.valid ? 'default' : 'destructive'} className="text-[10px]">
              {preview.valid ? '유효' : '오류'}
            </Badge>
            {loading && <span className="text-xs text-muted-foreground">검증 중...</span>}
          </div>
          {preview.error && (
            <p className="text-xs text-destructive">{preview.error}</p>
          )}
          {preview.valid && preview.samples && preview.samples.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">미리보기 (처음 5건)</p>
              <div className="flex gap-2">
                {preview.samples.map((s, i) => (
                  <span key={i} className="rounded bg-background px-1.5 py-0.5 text-xs font-mono border">
                    {s == null ? 'NULL' : String(s)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {preview.valid && preview.sql && (
            <p className="text-[10px] text-muted-foreground font-mono break-all">
              SQL: {preview.sql}
            </p>
          )}
        </div>
      )}

      {/* Help */}
      <div className="rounded-md border p-2 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">수식 도움말</p>
        {FORMULA_HELP.map((h) => (
          <p key={h.label} className="text-[10px] text-muted-foreground">
            <span className="font-medium">{h.label}:</span> {h.examples}
          </p>
        ))}
      </div>
    </div>
  )
}
