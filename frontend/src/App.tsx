import { Routes, Route } from 'react-router'

import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import RootLayout from '@/layouts/RootLayout'
import AppBuilderPage from '@/pages/AppBuilderPage'
import AppListPage from '@/pages/AppListPage'
import AppSettingsPage from '@/pages/AppSettingsPage'
import AutomationsPage from '@/pages/AutomationsPage'
import DashboardPage from '@/pages/DashboardPage'
import InterfaceDesignerPage from '@/pages/InterfaceDesignerPage'
import GlobalAutomationsPage from '@/pages/GlobalAutomationsPage'
import GlobalCalendarPage from '@/pages/GlobalCalendarPage'
import GlobalDashboardPage from '@/pages/GlobalDashboardPage'
import ProcessPage from '@/pages/ProcessPage'
import RelationshipPage from '@/pages/RelationshipPage'
import SettingsPage from '@/pages/SettingsPage'
import AppViewPage from '@/pages/AppViewPage'
import EntryPage from '@/pages/EntryPage'
import LoginPage from '@/pages/LoginPage'
import MigrationHistoryPage from '@/pages/MigrationHistoryPage'
import NotFoundPage from '@/pages/NotFoundPage'
import UsersPage from '@/pages/UsersPage'
import ProfilePage from '@/pages/ProfilePage'
import OrgChartPage from '@/pages/OrgChartPage'
import AIChatPage from '@/pages/AIChatPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RootLayout />}>
        <Route index element={<ErrorBoundary><AppListPage /></ErrorBoundary>} />
        <Route path="/apps" element={<ErrorBoundary><AppListPage /></ErrorBoundary>} />
        <Route path="/apps/relationships" element={<ErrorBoundary><RelationshipPage /></ErrorBoundary>} />
        <Route path="/apps/new" element={<ErrorBoundary><AppBuilderPage /></ErrorBoundary>} />
        <Route path="/apps/:appId" element={<ErrorBoundary><AppViewPage /></ErrorBoundary>} />
        <Route path="/apps/:appId/entries/new" element={<ErrorBoundary><EntryPage /></ErrorBoundary>} />
        <Route path="/apps/:appId/entries/:entryId" element={<ErrorBoundary><EntryPage /></ErrorBoundary>} />
        <Route path="/apps/:appId/dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
        <Route path="/apps/:appId/interface" element={<ErrorBoundary><InterfaceDesignerPage /></ErrorBoundary>} />
        <Route path="/apps/:appId/settings" element={<ErrorBoundary><AppSettingsPage /></ErrorBoundary>} />
        <Route path="/apps/:appId/process" element={<ErrorBoundary><ProcessPage /></ErrorBoundary>} />
        <Route path="/apps/:appId/automations" element={<ErrorBoundary><AutomationsPage /></ErrorBoundary>} />
        <Route path="/dashboard" element={<ErrorBoundary><GlobalDashboardPage /></ErrorBoundary>} />
        <Route path="/calendar" element={<ErrorBoundary><GlobalCalendarPage /></ErrorBoundary>} />
        <Route path="/automations" element={<ErrorBoundary><GlobalAutomationsPage /></ErrorBoundary>} />
        <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
        <Route path="/history" element={<ErrorBoundary><MigrationHistoryPage /></ErrorBoundary>} />
        <Route path="/admin/users" element={<ErrorBoundary><UsersPage /></ErrorBoundary>} />
        <Route path="/admin/org" element={<ErrorBoundary><OrgChartPage /></ErrorBoundary>} />
        <Route path="/ai" element={<ErrorBoundary><AIChatPage /></ErrorBoundary>} />
        <Route path="/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
