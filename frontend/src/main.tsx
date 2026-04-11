import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { ErrorBoundary } from './components/common/ErrorBoundary'
import { InstallPrompt } from './components/common/InstallPrompt'
import { OfflineBanner } from './components/common/OfflineBanner'
import { Toaster } from './components/ui/sonner'
import ExcelLayout from './layouts/ExcelLayout'
import RootLayout from './layouts/RootLayout'
import { queryClient } from './lib/queryClient'
import AIChatPage from './pages/AIChatPage'
import AppBuilderPage from './pages/AppBuilderPage'
import AppListPage from './pages/AppListPage'
import AppViewPage from './pages/AppViewPage'
import EntryPage from './pages/EntryPage'
import GlobalAutomationsPage from './pages/GlobalAutomationsPage'
import LoginPage from './pages/LoginPage'
import MigrationHistoryPage from './pages/MigrationHistoryPage'
import NotFoundPage from './pages/NotFoundPage'
import ProfilePage from './pages/ProfilePage'
import RelationshipPage from './pages/RelationshipPage'
import SettingsPage from './pages/SettingsPage'
import UsersPage from './pages/UsersPage'
import './index.css'
import './pwa'

const EB = ErrorBoundary

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ExcelLayout />,
    children: [
      {
        path: 'apps/:appId',
        element: <EB><AppViewPage /></EB>,
        children: [
          { path: 'entries/new', element: <EB><EntryPage /></EB> },
          { path: 'entries/:entryId', element: <EB><EntryPage /></EB> },
        ],
      },
    ],
  },
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <EB><AppListPage /></EB> },
      { path: 'apps', element: <EB><AppListPage /></EB> },
      { path: 'apps/relationships', element: <EB><RelationshipPage /></EB> },
      { path: 'apps/new', element: <EB><AppBuilderPage /></EB> },
      { path: 'automations', element: <EB><GlobalAutomationsPage /></EB> },
      { path: 'settings', element: <EB><SettingsPage /></EB> },
      { path: 'history', element: <EB><MigrationHistoryPage /></EB> },
      { path: 'admin/users', element: <EB><UsersPage /></EB> },
      { path: 'ai', element: <EB><AIChatPage /></EB> },
      { path: 'profile', element: <EB><ProfilePage /></EB> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <OfflineBanner />
        <InstallPrompt />
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster richColors closeButton position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
)
