import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36]

interface FontSizeSelectorProps {
  value: number | undefined
  onChange: (size: number | undefined) => void
  disabled?: boolean
}

export function FontSizeSelector({ value, onChange, disabled }: FontSizeSelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`flex items-center gap-0.5 h-6 px-1 border border-stone-300 rounded text-[11px] hover:bg-stone-50 min-w-[40px] ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      >
        <span className="w-5 text-center text-[11px]">{value ?? '11'}</span>
        <ChevronDown className="h-3 w-3 text-stone-400" />
      </PopoverTrigger>
      <PopoverContent className="w-20 p-1" align="start" sideOffset={4}>
        <div className="flex flex-col">
          {SIZES.map((size) => (
            <button
              key={size}
              className={`text-left px-2 py-0.5 text-[11px] rounded hover:bg-stone-100 ${value === size ? 'bg-stone-100 font-medium' : ''}`}
              onClick={() => { onChange(size); setOpen(false) }}
            >
              {size}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
