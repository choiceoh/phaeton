import { Link, Outlet } from 'react-router'

import { useAuth } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/constants'

export default function RootLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        로딩 중...
      </div>
    )
  }

  if (!user) {
    // useAuth already redirected — render nothing to avoid flicker.
    return null
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold text-stone-900">
            Phaeton
          </Link>
          <Link to="/apps" className="text-sm text-stone-600 hover:text-stone-900">
            컬렉션
          </Link>
          {(user.role === 'director' || user.role === 'pm') && (
            <Link to="/history" className="text-sm text-stone-600 hover:text-stone-900">
              이력
            </Link>
          )}
        </div>
        <div className="text-sm text-stone-500">
          {user.name} ({ROLE_LABELS[user.role] || user.role})
        </div>
      </nav>
      <main className="mx-auto max-w-7xl p-6">
        <Outlet />
      </main>
    </div>
  )
}
