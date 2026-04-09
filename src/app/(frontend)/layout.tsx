import { headers } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import { Toaster } from 'sonner'

import { ChatContextProvider } from '@/components/ChatContext'
import ChatWidget from '@/components/ChatWidget'

import config from '@payload-config'

import './globals.css'

export const dynamic = 'force-dynamic'

const BANNER_STYLES = {
  info: 'bg-stone-100 text-stone-800 border-stone-300',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
} as const

export const metadata = {
  title: 'Phaeton — 에너지 프로젝트 관리',
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const payload = await getPayload({ config })
  let user: { name?: string; role?: string } | null = null
  try {
    const result = await payload.auth({ headers: await headers() })
    user = result.user
  } catch {
    // 개발 단계 — 인증 없이 접근 허용
  }

  const settings = await (payload as any).findGlobal({ slug: 'site-settings' })
  const nav = settings?.navigation
  const banner = settings?.banner

  const NAV = [
    { href: '/projects', label: nav?.projectsLabel || '프로젝트' },
    { href: '/my-projects', label: nav?.myProjectsLabel || '내 업무' },
    { href: '/dashboard', label: nav?.dashboardLabel || '대시보드' },
    { href: '/staff', label: nav?.staffLabel || '인력 현황' },
    { href: '/alerts', label: nav?.alertsLabel || '알림' },
  ]

  return (
    <html lang="ko">
      <body className="min-h-screen bg-ivory-100">
        {banner?.enabled && banner?.text && (
          <div
            className={`border-b px-6 py-2 text-sm ${
              BANNER_STYLES[banner.type as keyof typeof BANNER_STYLES] || BANNER_STYLES.info
            }`}
          >
            {banner.text}
          </div>
        )}
        <nav
          aria-label="메인 내비게이션"
          className="flex items-center justify-between border-b border-stone-200 bg-ivory-50 px-6 py-3"
        >
          <div className="flex items-center gap-6">
            <Link href="/projects" className="text-lg font-semibold">
              Phaeton
            </Link>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-sm text-stone-600 hover:text-stone-900"
              >
                {n.label}
              </Link>
            ))}
          </div>
          <div className="text-sm text-stone-500">
            {user ? (
              <>
                {user.name} ({user.role})
                {['director', 'pm'].includes(user.role as string) && (
                  <Link href="/admin" className="ml-4 text-stone-700 underline underline-offset-2">
                    관리
                  </Link>
                )}
              </>
            ) : (
              <Link href="/admin/login" className="text-stone-700 underline underline-offset-2">
                로그인
              </Link>
            )}
          </div>
        </nav>
        <ChatContextProvider>
          <main className="mx-auto max-w-7xl p-6">{children}</main>
          <Toaster richColors position="top-right" />
          <ChatWidget />
        </ChatContextProvider>
      </body>
    </html>
  )
}
