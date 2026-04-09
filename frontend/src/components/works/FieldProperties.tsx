import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ON_DELETE_OPTIONS, RELATION_TYPE_LABELS } from '@/lib/constants'
import type { Collection } from '@/lib/types'

import type { FieldDraft } from './FieldPreview'

interface Props {
  field: FieldDraft | null
  collections: Collection[]
  onChange: (field: FieldDraft) => void
}

export default function FieldProperties({ field, collections, onChange }: Props) {
  if (!field) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        필드를 선택하세요
      </div>
    )
  }

  function update(patch: Partial<FieldDraft>) {
    onChange({ ...field!, ...patch })
  }

  const selectChoices = (field.options?.choices as string[]) || []

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">필드 속성</h3>

      <div className="space-y-2">
        <Label>라벨</Label>
        <Input value={field.label} onChange={(e) => update({ label: e.target.value })} />
      </div>

      <div className="space-y-2">
        <Label>슬러그 (영문)</Label>
        <Input
          value={field.slug}
          onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
          placeholder="snake_case"
        />
        <p className="text-xs text-muted-foreground">[a-z][a-z0-9_]{'{0,62}'}</p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="required"
          checked={field.is_required}
          onCheckedChange={(c) => update({ is_required: !!c })}
        />
        <Label htmlFor="required">필수</Label>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="unique"
          checked={field.is_unique}
          onCheckedChange={(c) => update({ is_unique: !!c })}
        />
        <Label htmlFor="unique">고유값</Label>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="indexed"
          checked={field.is_indexed}
          onCheckedChange={(c) => update({ is_indexed: !!c })}
        />
        <Label htmlFor="indexed">인덱스</Label>
      </div>

      {(field.field_type === 'select' || field.field_type === 'multiselect') && (
        <div className="space-y-2">
          <Label>선택 옵션 (줄바꿈)</Label>
          <Textarea
            rows={4}
            value={selectChoices.join('\n')}
            onChange={(e) => {
              const choices = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
              update({ options: { ...field.options, choices } })
            }}
          />
        </div>
      )}

      {field.field_type === 'relation' && (
        <div className="space-y-2 border-t pt-4">
          <Label>대상 컬렉션</Label>
          <Select
            value={field.relation?.target_collection_id || ''}
            onValueChange={(v) =>
              v &&
              update({
                relation: {
                  target_collection_id: v,
                  relation_type: field.relation?.relation_type || 'one_to_many',
                  on_delete: field.relation?.on_delete || 'SET NULL',
                },
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label>관계 유형</Label>
          <Select
            value={field.relation?.relation_type || 'one_to_many'}
            onValueChange={(v) =>
              v &&
              field.relation &&
              update({
                relation: { ...field.relation, relation_type: v as 'one_to_one' | 'one_to_many' | 'many_to_many' },
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RELATION_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label>삭제 시 동작</Label>
          <Select
            value={field.relation?.on_delete || 'SET NULL'}
            onValueChange={(v) =>
              v &&
              field.relation &&
              update({ relation: { ...field.relation, on_delete: v } })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ON_DELETE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
