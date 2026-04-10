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
      <div className="min-h-screen bg-stone-50/80">
        <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200/80 bg-white/95 px-6 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <Link to="/" className="mr-4 flex items-center gap-2 text-lg font-bold tracking-tight text-stone-900" viewTransition>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-xs font-bold text-white">P</span>
              Phaeton
            </Link>
            <div className="flex items-center">
              <NavLink to="/apps" className={({ isActive }) => `nav-link rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'active text-stone-900' : 'text-stone-500 hover:text-stone-900'}`} viewTransition>
                업무
              </NavLink>
              <NavLink to="/dashboard" className={({ isActive }) => `nav-link rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'active text-stone-900' : 'text-stone-500 hover:text-stone-900'}`} viewTransition>
                대시보드
              </NavLink>
              <NavLink to="/automations" className={({ isActive }) => `nav-link rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'active text-stone-900' : 'text-stone-500 hover:text-stone-900'}`} viewTransition>
                자동화
              </NavLink>
              <NavLink to="/admin/org" className={({ isActive }) => `nav-link rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'active text-stone-900' : 'text-stone-500 hover:text-stone-900'}`} viewTransition>
                조직도
              </NavLink>
              {(user.role === 'director' || user.role === 'pm') && (
                <>
                  <NavLink to="/history" className={({ isActive }) => `nav-link rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'active text-stone-900' : 'text-stone-500 hover:text-stone-900'}`} viewTransition>
                    이력
                  </NavLink>
                  <NavLink to="/admin/users" className={({ isActive }) => `nav-link rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'active text-stone-900' : 'text-stone-500 hover:text-stone-900'}`} viewTransition>
                    사용자 관리
                  </NavLink>
                  <NavLink to="/settings" className={({ isActive }) => `nav-link rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'active text-stone-900' : 'text-stone-500 hover:text-stone-900'}`} viewTransition>
                    설정
                  </NavLink>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-stone-500">
            <NotificationBell />
            <Link to="/profile" className="rounded-md px-2 py-1 transition-colors hover:bg-stone-100 hover:text-stone-900">
              {user.name}
              <span className="ml-1 text-xs text-stone-400">({ROLE_LABELS[user.role] || user.role})</span>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
              로그아웃
            </Button>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-6 py-8">
          <Outlet />
        </main>
        <AIChatPanel />
        <CommandPalette />
      </div>
    </AIAvailabilityProvider>
  )
}
