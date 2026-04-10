import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAIAvailable } from '@/contexts/AIAvailabilityContext'
import { useAIBuildFilter } from '@/hooks/useAI'
import {
  FILTER_OPERATORS,
  isLayoutType,
  operatorsForFieldType,
} from '@/lib/constants'
import type { Field, FilterCondition } from '@/lib/types'

interface Props {
  fields: Field[]
  conditions: FilterCondition[]
  onChange: (conditions: FilterCondition[]) => void
  slug?: string
}

export default function FilterBuilder({ fields, conditions, onChange, slug }: Props) {
  const idBase = useId()
  const dataFields = fields.filter((f) => !isLayoutType(f.field_type))
  const aiAvailable = useAIAvailable()
  const buildFilter = useAIBuildFilter(slug)
  const [aiQuery, setAiQuery] = useState('')

  function addCondition() {
    const first = dataFields[0]
    if (!first) return
    const ops = operatorsForFieldType(first.field_type)
    onChange([
      ...conditions,
      {
        id: `${idBase}-${Date.now()}`,
        field: first.slug,
        operator: ops[0] ?? 'eq',
        value: '',
      },
    ])
  }

  function updateCondition(id: string, patch: Partial<FilterCondition>) {
    onChange(
      conditions.map((c) => {
        if (c.id !== id) return c
        const updated = { ...c, ...patch }
        // When field changes, reset operator to first valid one.
        if (patch.field && patch.field !== c.field) {
          const f = dataFields.find((df) => df.slug === patch.field)
          if (f) {
            const ops = operatorsForFieldType(f.field_type)
            if (!ops.includes(updated.operator as never)) {
              updated.operator = ops[0] ?? 'eq'
            }
          }
          updated.value = ''
        }
        return updated
      }),
    )
  }

  function removeCondition(id: string) {
    onChange(conditions.filter((c) => c.id !== id))
  }

  function handleAIFilter() {
    if (!aiQuery.trim() || buildFilter.isPending) return
    buildFilter.mutate(aiQuery.trim(), {
      onSuccess: (res) => {
        const newConditions: FilterCondition[] = res.map((c, i) => ({
          id: `${idBase}-ai-${Date.now()}-${i}`,
          field: c.field,
          operator: c.operator,
          value: c.value ?? '',
        }))
        onChange(newConditions)
        setAiQuery('')
      },
    })
  }

  return (
    <div className="space-y-2">
      {aiAvailable && slug && (
        <>
          <div className="flex gap-1">
            <Input
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAIFilter()}
              placeholder="예: 이번 달 완료된 건 보여줘"
              className="h-8 text-sm"
              disabled={buildFilter.isPending}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              disabled={!aiQuery.trim() || buildFilter.isPending}
              onClick={handleAIFilter}
            >
              {buildFilter.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '적용'}
            </Button>
          </div>
          {conditions.length > 0 && (
            <div className="border-b pb-1 mb-1">
              <span className="text-[10px] text-muted-foreground">또는 직접 설정</span>
            </div>
          )}
        </>
      )}
      {conditions.map((cond) => {
        const field = dataFields.find((f) => f.slug === cond.field)
        const validOps = field ? operatorsForFieldType(field.field_type) : ['eq']
        const opLabels = FILTER_OPERATORS.filter((o) =>
          validOps.includes(o.value as never),
        )

        return (
          <div key={cond.id} className="flex items-center gap-2">
            {/* Field selector */}
            <Select
              value={cond.field}
              onValueChange={(v) => v && updateCondition(cond.id, { field: v })}
            >
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dataFields.map((f) => (
                  <SelectItem key={f.slug} value={f.slug}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator selector */}
            <Select
              value={cond.operator}
              onValueChange={(v) => v && updateCondition(cond.id, { operator: v })}
            >
              <SelectTrigger className="w-[120px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opLabels.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value input */}
            {cond.operator !== 'is_null' && (
              <ValueInput
                field={field}
                value={cond.value}
                onChange={(v) => updateCondition(cond.id, { value: v })}
              />
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeCondition(cond.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
      <Button variant="outline" size="sm" onClick={addCondition} className="gap-1">
        <Plus className="h-3 w-3" />
        조건 추가
      </Button>
    </div>
  )
}

function ValueInput({
  field,
  value,
  onChange,
}: {
  field?: Field
  value: string
  onChange: (v: string) => void
}) {
  const ft = field?.field_type

  // Select/multiselect: show dropdown of choices.
  if ((ft === 'select' || ft === 'multiselect') && field?.options?.choices) {
    const choices = field.options.choices as string[]
    return (
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="w-[160px] h-8 text-sm">
          <SelectValue placeholder="값 선택" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // Boolean: true/false dropdown.
  if (ft === 'boolean') {
    return (
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="w-[160px] h-8 text-sm">
          <SelectValue placeholder="값 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">예</SelectItem>
          <SelectItem value="false">아니오</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  // Date/datetime: use date input.
  if (ft === 'date') {
    return (
      <Input
        type="date"
        className="w-[160px] h-8 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (ft === 'datetime') {
    return (
      <Input
        type="datetime-local"
        className="w-[200px] h-8 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  // Number input.
  if (ft === 'number' || ft === 'integer') {
    return (
      <Input
        type="number"
        className="w-[160px] h-8 text-sm"
        placeholder="값 입력"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  // Default: text input.
  return (
    <Input
      className="w-[160px] h-8 text-sm"
      placeholder="값 입력"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
