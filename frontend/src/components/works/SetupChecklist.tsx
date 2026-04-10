import { Check, ChevronRight, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

interface ChecklistItem {
  label: string
  done: boolean
  href?: string
}

interface Props {
  collectionId: string
  items: ChecklistItem[]
}

export default function SetupChecklist({ collectionId, items }: Props) {
  const storageKey = `phaeton:checklist-dismissed:${collectionId}`
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })

  const completedCount = items.filter((i) => i.done).length
  const allDone = completedCount === items.length

  if (dismissed || allDone) return null

  const progress = Math.round((completedCount / items.length) * 100)

  return (
    <div className="mb-4 rounded-lg border bg-muted/30 p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium">앱 설정 가이드</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount}/{items.length} 완료
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            setDismissed(true)
            try { localStorage.setItem(storageKey, '1') } catch { /* ignore */ }
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted mb-3">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label}>
            {item.href ? (
              <Link
                to={item.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    item.done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  }`}
                >
                  {item.done && <Check className="h-3 w-3" />}
                </span>
                <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                  {item.label}
                </span>
                {!item.done && (
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Link>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    item.done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  }`}
                >
                  {item.done && <Check className="h-3 w-3" />}
                </span>
                <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                  {item.label}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
