import { Routes, Route } from 'react-router'

import RootLayout from '@/layouts/RootLayout'
import AppBuilderPage from '@/pages/AppBuilderPage'
import AppListPage from '@/pages/AppListPage'
import AppSettingsPage from '@/pages/AppSettingsPage'
import ProcessPage from '@/pages/ProcessPage'
import AppViewPage from '@/pages/AppViewPage'
import LoginPage from '@/pages/LoginPage'
import MigrationHistoryPage from '@/pages/MigrationHistoryPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RootLayout />}>
        <Route index element={<AppListPage />} />
        <Route path="/apps" element={<AppListPage />} />
        <Route path="/apps/new" element={<AppBuilderPage />} />
        <Route path="/apps/:appId" element={<AppViewPage />} />
        <Route path="/apps/:appId/settings" element={<AppSettingsPage />} />
        <Route path="/apps/:appId/process" element={<ProcessPage />} />
        <Route path="/history" element={<MigrationHistoryPage />} />
      </Route>
    </Routes>
  )
}
