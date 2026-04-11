import { useState } from 'react'
import { Ban } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const PALETTE = [
  // Row 1: grays
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  // Row 2: warm
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  // Row 3: pastels light
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  // Row 4: pastels medium
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  // Row 5: saturated
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
]

interface ColorPickerProps {
  value: string | undefined
  onChange: (color: string | undefined) => void
  icon: React.ReactNode
  title: string
  defaultIndicator?: string
  disabled?: boolean
}

export function ColorPicker({ value, onChange, icon, title, defaultIndicator = '#000000', disabled }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [customHex, setCustomHex] = useState('')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`flex flex-col items-center justify-center w-6 h-6 rounded hover:bg-stone-100 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
        title={title}
      >
        {icon}
        <div
          className="w-3.5 h-[3px] rounded-sm mt-px"
          style={{
            backgroundColor: value || defaultIndicator,
            border: value ? undefined : '1px solid #d4d4d4',
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start" sideOffset={4}>
        <div className="grid grid-cols-10 gap-0.5 mb-1.5">
          {PALETTE.map((color) => (
            <button
              key={color}
              className={`w-5 h-5 rounded-sm border border-stone-200 hover:scale-110 transition-transform ${value === color ? 'ring-1 ring-[#005a9e] ring-offset-1' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => { onChange(color); setOpen(false) }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 border-t pt-1.5">
          <button
            className="flex items-center justify-center w-5 h-5 rounded-sm border border-stone-200 hover:bg-stone-100"
            title="색상 없음"
            onClick={() => { onChange(undefined); setOpen(false) }}
          >
            <Ban className="h-3 w-3 text-stone-400" />
          </button>
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[10px] text-stone-400">#</span>
            <input
              className="flex-1 h-5 text-[11px] border border-stone-200 rounded px-1 outline-none focus:border-[#005a9e]"
              placeholder="hex"
              maxLength={6}
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && /^[0-9a-fA-F]{3,6}$/.test(customHex)) {
                  onChange(`#${customHex}`)
                  setCustomHex('')
                  setOpen(false)
                }
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
