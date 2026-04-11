import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'

import AIChatPanel from '@/components/common/AIChatPanel'
import CommandPalette from '@/components/common/CommandPalette'
import LoadingState from '@/components/common/LoadingState'
import TitleBar from '@/components/excel/TitleBar'
import ExcelRibbon from '@/components/excel/ExcelRibbon'
import SheetTabBar from '@/components/excel/SheetTabBar'
import { AIAvailabilityProvider } from '@/contexts/AIAvailabilityContext'
import { ExcelToolbarProvider } from '@/contexts/ExcelToolbarContext'
import { useCurrentUser } from '@/hooks/useAuth'

export default function ExcelLayout() {
  const { data: user, isLoading, isError } = useCurrentUser()
  const navigate = useNavigate()

  useEffect(() => {
    if (isError) navigate('/login', { replace: true })
  }, [isError, navigate])

  if (isLoading) return <LoadingState />
  if (!user) return null

  return (
    <AIAvailabilityProvider>
      <ExcelToolbarProvider>
        <div className="flex flex-col h-screen bg-white overflow-hidden">
          <TitleBar />
          <ExcelRibbon />
          <main className="flex-1 overflow-hidden px-0">
            <Outlet />
          </main>
          <SheetTabBar />
          <AIChatPanel />
          <CommandPalette />
        </div>
      </ExcelToolbarProvider>
    </AIAvailabilityProvider>
  )
}
