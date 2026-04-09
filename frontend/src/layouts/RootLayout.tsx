import { useEffect } from 'react'
import { Link, Outlet, useNavigate } from 'react-router'

import LoadingState from '@/components/common/LoadingState'
import { Button } from '@/components/ui/button'
import { useCurrentUser, useLogout } from '@/hooks/useAuth'
import { ROLE_LABELS } from '@/lib/constants'

export default function RootLayout() {
  const { data: user, isLoading, isError } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()

  // 401 from /me means session expired or never existed.
  useEffect(() => {
    if (isError) navigate('/login', { replace: true })
  }, [isError, navigate])

  if (isLoading) return <LoadingState />
  if (!user) return null // useEffect will redirect

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
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <span>
            {user.name} ({ROLE_LABELS[user.role] || user.role})
          </span>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
            로그아웃
          </Button>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl p-6">
        <Outlet />
      </main>
    </div>
  )
}
