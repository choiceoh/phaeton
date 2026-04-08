import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'

import ChatWidget from '@/components/ChatWidget'

import './globals.css'

export const dynamic = 'force-dynamic'

const NAV = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/projects', label: '프로젝트' },
  { href: '/staff', label: '인력 현황' },
  { href: '/alerts', label: '알림' },
]

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

  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b px-6 py-3 flex items-center
          justify-between"
        >
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold text-lg">
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
