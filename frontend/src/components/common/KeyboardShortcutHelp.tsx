import { Keyboard } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
const mod = isMac ? '⌘' : 'Ctrl'

interface Shortcut {
  keys: string
  description: string
}

const SECTIONS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: '테이블 탐색',
    shortcuts: [
      { keys: 'Tab / Shift+Tab', description: '다음/이전 셀로 이동' },
      { keys: '↑ ↓ ← →', description: '셀 방향 이동' },
      { keys: 'Enter', description: '셀 편집 시작 / 아래 셀로 이동' },
      { keys: 'F2', description: '선택한 셀 편집 모드' },
      { keys: 'Escape', description: '편집 취소' },
      { keys: `${mod}+V`, description: '클립보드 붙여넣기 (여러 셀)' },
    ],
  },
  {
    title: '일반',
    shortcuts: [
      { keys: `${mod}+Z`, description: '마지막 작업 되돌리기' },
      { keys: '?', description: '키보드 단축키 도움말' },
    ],
  },
]

export default function KeyboardShortcutHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only trigger on bare '?' key (not in input/textarea)
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground"
        title="키보드 단축키 (?)"
        onClick={() => setOpen(true)}
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              키보드 단축키
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                  {section.title}
                </h4>
                <div className="space-y-1.5">
                  {section.shortcuts.map((s) => (
                    <div
                      key={s.keys}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{s.description}</span>
                      <div className="flex items-center gap-1">
                        {s.keys.split(' / ').map((keyCombo, i) => (
                          <span key={i}>
                            {i > 0 && <span className="mx-1 text-muted-foreground">/</span>}
                            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
                              {keyCombo}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
