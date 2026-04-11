import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { LogOut, Settings, User } from 'lucide-react'

import AIChatPanel from '@/components/common/AIChatPanel'
import CommandPalette from '@/components/common/CommandPalette'
import SheetSidebar from '@/components/common/SheetSidebar'
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

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `nav-link whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'active text-foreground' : 'text-muted-foreground hover:text-foreground'}`

  return (
    <AIAvailabilityProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Left sidebar — sheet tree */}
        <SheetSidebar />

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-white/80 px-6 py-1.5 backdrop-blur-md backdrop-saturate-150">
            <div className="flex items-center gap-1.5">
              <Link to="/" className="mr-5 flex items-center gap-2 text-base font-bold tracking-tight text-foreground" viewTransition>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-white shadow-sm">T</span>
                <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Topworks</span>
              </Link>
              <div className="scrollbar-none flex items-center gap-0.5 overflow-x-auto">
                {/* 도구 */}
                <NavLink to="/automations" className={navCls} viewTransition>자동화</NavLink>
                <NavLink to="/ai" className={navCls} viewTransition>AI</NavLink>

                {/* 관리 */}
                {(user.role === 'director' || user.role === 'pm') && (
                  <>
                    <div className="mx-1.5 h-4 w-px bg-border" aria-hidden="true" />
                    <NavLink to="/history" className={navCls} viewTransition>이력</NavLink>
                    <NavLink to="/admin/users" className={navCls} viewTransition>사용자 관리</NavLink>
                    <NavLink to="/settings" className={navCls} viewTransition>설정</NavLink>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent focus-visible:outline-none">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-foreground text-[11px] font-medium text-white">
                      {user.name.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-foreground">{user.name}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-normal">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
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
          <main className="flex-1 overflow-y-auto px-6 pt-2 pb-4">
            <Outlet />
          </main>
        </div>
        <AIChatPanel />
        <CommandPalette />
      </div>
    </AIAvailabilityProvider>
  )
}
