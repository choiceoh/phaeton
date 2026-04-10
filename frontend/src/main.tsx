import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'

import App from './App'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { OfflineBanner } from './components/common/OfflineBanner'
import { Toaster } from './components/ui/sonner'
import { UndoProvider } from './contexts/UndoContext'
import { queryClient } from './lib/queryClient'
import './index.css'

const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UndoProvider>
        <ErrorBoundary>
          <OfflineBanner />
          <RouterProvider router={router} />
        </ErrorBoundary>
        <Toaster richColors closeButton position="top-right" />
      </UndoProvider>
    </QueryClientProvider>
  </StrictMode>,
)
