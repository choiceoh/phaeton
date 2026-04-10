import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { LogOut, Settings, User } from 'lucide-react'

import AIChatPanel from '@/components/common/AIChatPanel'
import CommandPalette from '@/components/common/CommandPalette'
import { AIAvailabilityProvider } from '@/contexts/AIAvailabilityContext'
import LoadingState from '@/components/common/LoadingState'
import NotificationBell from '@/components/common/NotificationBell'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

  // Scroll to top only when the base path changes (not on query/hash changes).
  const prevPathRef = useRef(pathname)
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      window.scrollTo(0, 0)
      prevPathRef.current = pathname
    }
  }, [pathname])

  if (isLoading) return <LoadingState />
  if (!user) return null // useEffect will redirect

  return (
    <AIAvailabilityProvider>
      <div className="min-h-screen bg-background">
        <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-white/80 px-6 py-2.5 backdrop-blur-md backdrop-saturate-150">
          <div className="flex items-center gap-1.5">
            <Link to="/" className="mr-5 flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground" viewTransition>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-xs font-bold text-white shadow-sm">T</span>
              <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Topworks</span>
            </Link>
            <div className="flex items-center gap-0.5">
              <NavLink to="/apps" className={({ isActive }) => `nav-link rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`} viewTransition>
                업무
              </NavLink>
              <NavLink to="/dashboard" className={({ isActive }) => `nav-link rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`} viewTransition>
                대시보드
              </NavLink>
              <NavLink to="/calendar" className={({ isActive }) => `nav-link rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`} viewTransition>
                캘린더
              </NavLink>
              <NavLink to="/automations" className={({ isActive }) => `nav-link rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`} viewTransition>
                자동화
              </NavLink>
              <NavLink to="/admin/org" className={({ isActive }) => `nav-link rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`} viewTransition>
                조직도
              </NavLink>
              {(user.role === 'director' || user.role === 'pm') && (
                <>
                  <NavLink to="/history" className={({ isActive }) => `nav-link rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`} viewTransition>
                    이력
                  </NavLink>
                  <NavLink to="/admin/users" className={({ isActive }) => `nav-link rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`} viewTransition>
                    사용자 관리
                  </NavLink>
                  <NavLink to="/settings" className={({ isActive }) => `nav-link rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`} viewTransition>
                    설정
                  </NavLink>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent focus-visible:outline-none">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-foreground text-[11px] font-medium text-white">
                    {user.name.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground">{user.name}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    내 정보
                  </DropdownMenuItem>
                  {(user.role === 'director' || user.role === 'pm') && (
                    <DropdownMenuItem onClick={() => navigate('/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      설정
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-6 py-10">
          <Outlet />
        </main>
        <AIChatPanel />
        <CommandPalette />
      </div>
    </AIAvailabilityProvider>
  )
}
