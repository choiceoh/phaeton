import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'

import ChatWidget from '@/components/ChatWidget'

import './globals.css'

export const dynamic = 'force-dynamic'

const BANNER_STYLES = {
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  urgent: 'bg-red-50 text-red-800 border-red-200',
} as const

export const metadata = {
  title: 'Phaeton — 에너지 프로젝트 관리',
}

export default async function FrontendLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/admin/login')

  const settings = await payload.findGlobal({ slug: 'site-settings' })
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
          <div className={`border-b px-6 py-2 text-sm ${
            BANNER_STYLES[banner.type as keyof typeof BANNER_STYLES]
              || BANNER_STYLES.info
          }`}>
            {banner.text}
          </div>
        )}
        <nav className="bg-ivory-50 border-b border-stone-200 px-6 py-3
          flex items-center justify-between"
        >
          <div className="flex items-center gap-6">
            <Link href="/projects" className="font-semibold text-lg">
              Phaeton
            </Link>
            {NAV.map(n => (
              <Link
                key={n.href}
                href={n.href}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {n.label}
              </Link>
            ))}
          </div>
          <div className="text-sm text-gray-500">
            {user.name} ({user.role})
            {['director', 'pm'].includes(user.role as string) && (
              <Link href="/admin" className="ml-4 text-blue-600">
                관리
              </Link>
            )}
          </div>
        </nav>
        <main className="max-w-7xl mx-auto p-6">{children}</main>
        <ChatWidget />
      </body>
    </html>
  )
}
