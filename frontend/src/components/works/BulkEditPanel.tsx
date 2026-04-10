import { Pencil } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { isLayoutType, isComputedType } from '@/lib/constants'
import type { Field } from '@/lib/types'
import { getChoices } from '@/lib/fieldGuards'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fields: Field[]
  selectedCount: number
  onApply: (fieldSlug: string, value: unknown) => void
  loading?: boolean
}

export default function BulkEditPanel({
  open,
  onOpenChange,
  fields,
  selectedCount,
  onApply,
  loading,
}: Props) {
  const [selectedField, setSelectedField] = useState('')
  const [value, setValue] = useState<unknown>('')

  const editableFields = fields.filter(
    (f) => !isLayoutType(f.field_type) && !isComputedType(f.field_type)
      && f.field_type !== 'file' && f.field_type !== 'autonumber',
  )

  const activeField = editableFields.find((f) => f.slug === selectedField)

  function handleApply() {
    if (!selectedField) return
    onApply(selectedField, value)
    setSelectedField('')
    setValue('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) { setSelectedField(''); setValue('') }
      onOpenChange(o)
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            일괄 편집
          </DialogTitle>
          <DialogDescription>
            선택한 {selectedCount}건의 데이터를 한번에 수정합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>수정할 항목</Label>
            <Select value={selectedField} onValueChange={(v) => { setSelectedField(v ?? ''); setValue('') }}>
              <SelectTrigger>
                <SelectValue placeholder="항목 선택" />
              </SelectTrigger>
              <SelectContent>
                {editableFields.map((f) => (
                  <SelectItem key={f.slug} value={f.slug}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {activeField && (
            <div className="space-y-1.5">
              <Label>새 값</Label>
              <BulkValueInput field={activeField} value={value} onChange={setValue} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedField || loading}
          >
            {loading ? '적용 중...' : `${selectedCount}건 수정`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BulkValueInput({
  field,
  value,
  onChange,
}: {
  field: Field
  value: unknown
  onChange: (v: unknown) => void
}) {
  switch (field.field_type) {
    case 'text':
      return (
        <Input
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${field.label} 입력`}
        />
      )
    case 'textarea':
      return (
        <Textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      )
    case 'number':
    case 'integer':
      return (
        <Input
          type="number"
          value={value === null || value === undefined ? '' : (value as number)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )
    case 'date':
      return (
        <DatePicker
          value={(value as string) || undefined}
          onChange={(v) => onChange(v ?? null)}
          placeholder="날짜 선택"
        />
      )
    case 'datetime':
      return (
        <Input
          type="datetime-local"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'boolean':
      return (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox checked={!!value} onCheckedChange={(c) => onChange(!!c)} />
          <span className="text-sm">{value ? '예' : '아니오'}</span>
        </div>
      )
    case 'select': {
      const choices = getChoices(field)
      return (
        <Select value={(value as string) || ''} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="항목 선택" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    default:
      return (
        <Input
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}
