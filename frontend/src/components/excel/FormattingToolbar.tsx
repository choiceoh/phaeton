import { Bold, Italic, Type, PaintBucket } from 'lucide-react'

import { ColorPicker } from './ColorPicker'
import { FontSizeSelector } from './FontSizeSelector'
import type { CellFormat } from '@/lib/types'

interface FormattingToolbarProps {
  currentFormat: CellFormat | null
  onFormatChange: (patch: Partial<CellFormat>) => void
  disabled?: boolean
}

export function FormattingToolbar({ currentFormat, onFormatChange, disabled }: FormattingToolbarProps) {
  const fmt = currentFormat ?? {}

  return (
    <div className="flex items-center gap-0.5">
      {/* Font size */}
      <FontSizeSelector
        value={fmt.fontSize}
        onChange={(fontSize) => onFormatChange({ fontSize })}
        disabled={disabled}
      />

      <div className="w-px h-3.5 bg-[#d4d4d4] mx-0.5" />

      {/* Bold */}
      <button
        className={`flex items-center justify-center w-6 h-6 rounded hover:bg-stone-100 ${disabled ? 'opacity-40 pointer-events-none' : ''} ${fmt.bold ? 'bg-stone-200' : ''}`}
        title="굵게 (Ctrl+B)"
        disabled={disabled}
        onClick={() => onFormatChange({ bold: !fmt.bold })}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      {/* Italic */}
      <button
        className={`flex items-center justify-center w-6 h-6 rounded hover:bg-stone-100 ${disabled ? 'opacity-40 pointer-events-none' : ''} ${fmt.italic ? 'bg-stone-200' : ''}`}
        title="기울임 (Ctrl+I)"
        disabled={disabled}
        onClick={() => onFormatChange({ italic: !fmt.italic })}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      <div className="w-px h-3.5 bg-[#d4d4d4] mx-0.5" />

      {/* Text color */}
      <ColorPicker
        value={fmt.color}
        onChange={(color) => onFormatChange({ color })}
        icon={<Type className="h-3 w-3" />}
        title="글꼴 색"
        defaultIndicator="#000000"
        disabled={disabled}
      />

      {/* Background color */}
      <ColorPicker
        value={fmt.bg}
        onChange={(bg) => onFormatChange({ bg })}
        icon={<PaintBucket className="h-3 w-3" />}
        title="채우기 색"
        defaultIndicator="#ffffff"
        disabled={disabled}
      />
    </div>
  )
}
