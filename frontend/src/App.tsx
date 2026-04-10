import { Routes, Route } from 'react-router'

import RootLayout from '@/layouts/RootLayout'
import AppBuilderPage from '@/pages/AppBuilderPage'
import AppListPage from '@/pages/AppListPage'
import AppSettingsPage from '@/pages/AppSettingsPage'
import DashboardPage from '@/pages/DashboardPage'
import ProcessPage from '@/pages/ProcessPage'
import AppViewPage from '@/pages/AppViewPage'
import LoginPage from '@/pages/LoginPage'
import MigrationHistoryPage from '@/pages/MigrationHistoryPage'
import NotFoundPage from '@/pages/NotFoundPage'
import UsersPage from '@/pages/UsersPage'
import ProfilePage from '@/pages/ProfilePage'
import OrgChartPage from '@/pages/OrgChartPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RootLayout />}>
        <Route index element={<AppListPage />} />
        <Route path="/apps" element={<AppListPage />} />
        <Route path="/apps/new" element={<AppBuilderPage />} />
        <Route path="/apps/:appId" element={<AppViewPage />} />
        <Route path="/apps/:appId/dashboard" element={<DashboardPage />} />
        <Route path="/apps/:appId/settings" element={<AppSettingsPage />} />
        <Route path="/apps/:appId/process" element={<ProcessPage />} />
        <Route path="/history" element={<MigrationHistoryPage />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/org" element={<OrgChartPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
