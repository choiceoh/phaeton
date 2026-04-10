import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import AIChatPanel from '@/components/common/AIChatPanel'
import CommandPalette from '@/components/common/CommandPalette'
import { AIAvailabilityProvider } from '@/contexts/AIAvailabilityContext'
import LoadingState from '@/components/common/LoadingState'
import NotificationBell from '@/components/common/NotificationBell'
import { Button } from '@/components/ui/button'
import { useCurrentUser, useLogout } from '@/hooks/useAuth'
import { ROLE_LABELS } from '@/lib/constants'

export default function RootLayout() {
  const { data: user, isLoading, isError } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // 401 from /me means session expired or never existed.
  useEffect(() => {
    if (isError) navigate('/login', { replace: true })
  }, [isError, navigate])

  // Scroll to top on page navigation.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  if (isLoading) return <LoadingState />
  if (!user) return null // useEffect will redirect

  return (
    <AIAvailabilityProvider>
      <div className="min-h-screen bg-stone-50">
        <nav className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-semibold text-stone-900" viewTransition>
              Phaeton
            </Link>
            <NavLink to="/apps" className="nav-link text-sm text-stone-600 hover:text-stone-900" viewTransition>
              업무
            </NavLink>
            <NavLink to="/dashboard" className="nav-link text-sm text-stone-600 hover:text-stone-900" viewTransition>
              대시보드
            </NavLink>
            <NavLink to="/admin/org" className="nav-link text-sm text-stone-600 hover:text-stone-900" viewTransition>
              조직도
            </NavLink>
            <NavLink to="/automations" className="nav-link text-sm text-stone-600 hover:text-stone-900" viewTransition>
              자동화
            </NavLink>
            {(user.role === 'director' || user.role === 'pm') && (
              <>
                <NavLink to="/history" className="nav-link text-sm text-stone-600 hover:text-stone-900" viewTransition>
                  이력
                </NavLink>
                <NavLink to="/admin/users" className="nav-link text-sm text-stone-600 hover:text-stone-900" viewTransition>
                  사용자 관리
                </NavLink>
                <NavLink to="/settings" className="nav-link text-sm text-stone-600 hover:text-stone-900" viewTransition>
                  설정
                </NavLink>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <NotificationBell />
            <Link to="/profile" className="hover:text-stone-900">
              {user.name} ({ROLE_LABELS[user.role] || user.role})
            </Link>
            <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
              로그아웃
            </Button>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl p-6">
          <Outlet />
        </main>
        <AIChatPanel />
        <CommandPalette />
      </div>
    </AIAvailabilityProvider>
  )
}
