import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const isMacOS = /Macintosh/.test(navigator.userAgent)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone)

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showSafariGuide, setShowSafariGuide] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('pwa-install-dismissed') || isStandalone) return

    // Safari on macOS: show manual guide
    if (isSafari && isMacOS) {
      setShowSafariGuide(true)
      return
    }

    // Chromium: capture install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dismissed || isStandalone) return null
  if (!deferredPrompt && !showSafariGuide) return null

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  const dismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', '1')
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg">
      <Download className="h-5 w-5 shrink-0 text-neutral-600" />
      {showSafariGuide ? (
        <span className="text-sm">
          메뉴 &gt; <strong>파일</strong> &gt; <strong>Dock에 추가</strong>로 앱을 설치할 수 있습니다.
        </span>
      ) : (
        <>
          <span className="text-sm">앱으로 설치하면 더 빠르게 사용할 수 있습니다.</span>
          <Button size="sm" onClick={install}>설치</Button>
        </>
      )}
      <button onClick={dismiss} className="text-neutral-400 hover:text-neutral-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
