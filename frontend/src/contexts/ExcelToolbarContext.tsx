import { createContext, useContext, useState, type ReactNode } from 'react'

export interface FileMenuActions {
  onXlsxExport?: () => void
  onCsvExport?: () => void
  onPdfExport?: () => void
  onEmailReport?: () => void
  onImport?: () => void
  canManage?: boolean
}

interface ExcelToolbarState {
  /** Toolbar content from AppViewPage rendered inside the ribbon */
  toolbarContent: ReactNode
  setToolbarContent: (content: ReactNode) => void
  /** Sheet tabs (SavedViews) from AppViewPage */
  sheetTabs: ReactNode
  setSheetTabs: (tabs: ReactNode) => void
  /** Collection label for title bar */
  collectionLabel: string
  setCollectionLabel: (label: string) => void
  /** Workbook label for title bar */
  workbookLabel: string
  setWorkbookLabel: (label: string) => void
  /** Page-level actions (settings, new entry, etc.) */
  pageActions: ReactNode
  setPageActions: (actions: ReactNode) => void
  /** Read-only banner */
  readOnlyBanner: ReactNode
  setReadOnlyBanner: (banner: ReactNode) => void
  /** Status bar content (selection stats) — rendered in SheetTabBar */
  statusBar: ReactNode
  setStatusBar: (content: ReactNode) => void
  /** Data tab content (sort/filter controls) — rendered in ExcelRibbon */
  dataTabContent: ReactNode
  setDataTabContent: (content: ReactNode) => void
  /** File menu actions (export/import) — set by AppViewPage */
  fileMenuActions: FileMenuActions
  setFileMenuActions: (actions: FileMenuActions) => void
}

const ExcelToolbarContext = createContext<ExcelToolbarState | null>(null)

export function ExcelToolbarProvider({ children }: { children: ReactNode }) {
  const [toolbarContent, setToolbarContent] = useState<ReactNode>(null)
  const [sheetTabs, setSheetTabs] = useState<ReactNode>(null)
  const [collectionLabel, setCollectionLabel] = useState('')
  const [workbookLabel, setWorkbookLabel] = useState('')
  const [pageActions, setPageActions] = useState<ReactNode>(null)
  const [readOnlyBanner, setReadOnlyBanner] = useState<ReactNode>(null)
  const [statusBar, setStatusBar] = useState<ReactNode>(null)
  const [dataTabContent, setDataTabContent] = useState<ReactNode>(null)
  const [fileMenuActions, setFileMenuActions] = useState<FileMenuActions>({})

  return (
    <ExcelToolbarContext.Provider
      value={{
        toolbarContent, setToolbarContent,
        sheetTabs, setSheetTabs,
        collectionLabel, setCollectionLabel,
        workbookLabel, setWorkbookLabel,
        pageActions, setPageActions,
        readOnlyBanner, setReadOnlyBanner,
        statusBar, setStatusBar,
        dataTabContent, setDataTabContent,
        fileMenuActions, setFileMenuActions,
      }}
    >
      {children}
    </ExcelToolbarContext.Provider>
  )
}

export function useExcelToolbar() {
  const ctx = useContext(ExcelToolbarContext)
  if (!ctx) throw new Error('useExcelToolbar must be used within ExcelToolbarProvider')
  return ctx
}

/** Optional version — returns null when outside ExcelToolbarProvider. */
export function useExcelToolbarOptional() {
  return useContext(ExcelToolbarContext)
}
