import { Routes, Route } from 'react-router'

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
        <Route index element={<AppListPage />} />
        <Route path="/apps" element={<AppListPage />} />
        <Route path="/apps/relationships" element={<RelationshipPage />} />
        <Route path="/apps/new" element={<AppBuilderPage />} />
        <Route path="/apps/:appId" element={<AppViewPage />} />
        <Route path="/apps/:appId/entries/new" element={<EntryPage />} />
        <Route path="/apps/:appId/entries/:entryId" element={<EntryPage />} />
        <Route path="/apps/:appId/dashboard" element={<DashboardPage />} />
        <Route path="/apps/:appId/interface" element={<InterfaceDesignerPage />} />
        <Route path="/apps/:appId/settings" element={<AppSettingsPage />} />
        <Route path="/apps/:appId/process" element={<ProcessPage />} />
        <Route path="/apps/:appId/automations" element={<AutomationsPage />} />
        <Route path="/dashboard" element={<GlobalDashboardPage />} />
        <Route path="/calendar" element={<GlobalCalendarPage />} />
        <Route path="/automations" element={<GlobalAutomationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<MigrationHistoryPage />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/org" element={<OrgChartPage />} />
        <Route path="/ai" element={<AIChatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
