/**
 * FormatToolbar — Contextual column format toolbar for SpreadsheetView.
 *
 * Appears when a cell is selected and shows formatting options relevant to the
 * column's field type (number display type, decimal places, currency code,
 * text display type). Changes are persisted via PATCH field options API.
 */
import { motion } from 'framer-motion'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DECIMAL_PLACES_OPTIONS,
  NUMBER_DISPLAY_TYPES,
  TEXT_DISPLAY_TYPES,
} from '@/lib/constants'
import { isNumericField, getDecimalPlaces, getDisplayType } from '@/lib/fieldGuards'
import { fadeSlideDown, FAST } from '@/lib/motion'
import type { Field } from '@/lib/types'

interface FormatToolbarProps {
  field: Field
  collectionId: string
  onUpdateOptions: (fieldId: string, options: Record<string, unknown>) => Promise<void>
}

export default function FormatToolbar({ field, onUpdateOptions }: FormatToolbarProps) {
  const isNumeric = isNumericField(field)
  const isText = field.field_type === 'text' || field.field_type === 'textarea'

  if (!isNumeric && !isText) return null

  const displayType = getDisplayType(field) ?? 'plain'

  function handleOptionChange(key: string, value: unknown) {
    onUpdateOptions(field.id, { ...field.options, [key]: value })
  }

  return (
    <motion.div
      variants={fadeSlideDown}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={FAST}
      className="flex items-center gap-2 border-t pt-1.5 mt-1.5"
    >
      <span className="text-xs text-muted-foreground shrink-0">{field.label}</span>

      {/* Display type selector */}
      <Select
        value={displayType}
        onValueChange={(v) => handleOptionChange('display_type', v === 'plain' ? undefined : v)}
      >
        <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(isNumeric ? NUMBER_DISPLAY_TYPES : TEXT_DISPLAY_TYPES).map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Decimal places (number only) */}
      {isNumeric && (
        <Select
          value={(() => {
            const dp = getDecimalPlaces(field)
            return dp !== undefined ? String(dp) : ''
          })()}
          onValueChange={(v) => handleOptionChange('decimal_places', v === '' ? undefined : Number(v))}
        >
          <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
            <SelectValue placeholder="소수점" />
          </SelectTrigger>
          <SelectContent>
            {DECIMAL_PLACES_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Currency code (when display_type is currency) */}
      {isNumeric && displayType === 'currency' && (
        <Select
          value={(field.options as Record<string, unknown>)?.currency_code as string ?? 'KRW'}
          onValueChange={(v) => handleOptionChange('currency_code', v)}
        >
          <SelectTrigger className="h-7 w-auto min-w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="KRW">KRW (₩)</SelectItem>
            <SelectItem value="USD">USD ($)</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="JPY">JPY (¥)</SelectItem>
          </SelectContent>
        </Select>
      )}
    </motion.div>
  )
}
