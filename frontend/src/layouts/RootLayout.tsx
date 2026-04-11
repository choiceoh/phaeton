import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'

import AIChatPanel from '@/components/common/AIChatPanel'
import CommandPalette from '@/components/common/CommandPalette'
import { AIAvailabilityProvider } from '@/contexts/AIAvailabilityContext'
import LoadingState from '@/components/common/LoadingState'
import AppSidebar from '@/components/sidebar/AppSidebar'
import { useCurrentUser } from '@/hooks/useAuth'

export default function RootLayout() {
  const { data: user, isLoading, isError } = useCurrentUser()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isError) navigate('/login', { replace: true })
  }, [isError, navigate])

  // Scroll main panel to top on path change.
  const prevPathRef = useRef(pathname)
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      mainRef.current?.scrollTo(0, 0)
      prevPathRef.current = pathname
    }
  }, [pathname])

  if (isLoading) return <LoadingState />
  if (!user) return null

  return (
    <AIAvailabilityProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar user={user} />
        <main ref={mainRef} className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <AIChatPanel />
        <CommandPalette />
      </div>
    </AIAvailabilityProvider>
  )
}
