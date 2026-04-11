/**
 * SheetSidebar — Left sidebar with Folders -> Workbooks -> Sheets tree.
 *
 * Replaces the flat app list in the top navbar with a collapsible tree
 * that mirrors Excel's workbook/sheet metaphor.
 */
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FolderOpen,
  Layers,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { NavLink, useParams } from 'react-router'

import { useCollections, useWorkbooks } from '@/hooks/useCollections'
import type { Collection, Workbook } from '@/lib/types'

// --- localStorage persistence for collapse state ---
const COLLAPSE_KEY = 'phaeton:sidebar-collapsed'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveCollapsed(set: Set<string>) {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]))
}

// --- Tree data structures ---
interface SheetNode {
  collection: Collection
}

interface WorkbookNode {
  workbook: Workbook
  sheets: SheetNode[]
}

interface FolderNode {
  label: string
  workbooks: WorkbookNode[]
}

export default function SheetSidebar() {
  const { appId } = useParams()
  const { data: workbooks } = useWorkbooks()
  const { data: collections } = useCollections()

  const [collapsed, setCollapsed] = useState(loadCollapsed)

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveCollapsed(next)
      return next
    })
  }, [])

  // Build tree: folders -> workbooks -> sheets
  const { folders, ungroupedWorkbooks } = useMemo(() => {
    if (!workbooks || !collections) return { folders: [], ungroupedWorkbooks: [] }

    // Map collections by workbook_id
    const sheetsByWb = new Map<string, Collection[]>()
    const orphanSheets: Collection[] = []
    for (const col of collections) {
      if (col.workbook_id) {
        const arr = sheetsByWb.get(col.workbook_id) ?? []
        arr.push(col)
        sheetsByWb.set(col.workbook_id, arr)
      } else {
        orphanSheets.push(col)
      }
    }

    // Build workbook nodes
    const wbNodes = new Map<string, WorkbookNode>()
    for (const wb of workbooks) {
      const sheets = (sheetsByWb.get(wb.id) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ collection: c }))
      wbNodes.set(wb.id, { workbook: wb, sheets })
    }

    // Group workbooks by group_label (folder)
    const folderMap = new Map<string, WorkbookNode[]>()
    const ungrouped: WorkbookNode[] = []
    for (const wb of workbooks) {
      const node = wbNodes.get(wb.id)!
      if (wb.group_label) {
        const arr = folderMap.get(wb.group_label) ?? []
        arr.push(node)
        folderMap.set(wb.group_label, arr)
      } else {
        ungrouped.push(node)
      }
    }

    const folderNodes: FolderNode[] = [...folderMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, wbs]) => ({ label, workbooks: wbs }))

    // Add orphan sheets as a virtual workbook if any exist
    if (orphanSheets.length > 0) {
      ungrouped.push({
        workbook: {
          id: '__orphan__',
          label: '미분류 시트',
          sort_order: 9999,
          created_at: '',
          updated_at: '',
        },
        sheets: orphanSheets
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((c) => ({ collection: c })),
      })
    }

    return { folders: folderNodes, ungroupedWorkbooks: ungrouped }
  }, [workbooks, collections])

  const sheetLinkCls = (isActive: boolean) =>
    `flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] truncate transition-colors ${
      isActive
        ? 'bg-accent font-medium text-foreground'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    }`

  function renderSheet(node: SheetNode) {
    return (
      <NavLink
        key={node.collection.id}
        to={`/apps/${node.collection.id}`}
        className={({ isActive }) => sheetLinkCls(isActive || appId === node.collection.id)}
        viewTransition
      >
        <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{node.collection.label}</span>
      </NavLink>
    )
  }

  function renderWorkbook(node: WorkbookNode, depth: number = 0) {
    if (node.workbook.id === '__orphan__' && node.sheets.length === 0) return null
    const key = `wb:${node.workbook.id}`
    const isOpen = !collapsed.has(key)

    return (
      <div key={node.workbook.id}>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => toggleCollapse(key)}
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.workbook.label}</span>
          {node.sheets.length > 0 && (
            <span className="ml-auto text-[11px] text-muted-foreground">{node.sheets.length}</span>
          )}
        </button>
        {isOpen && (
          <div className="ml-4" style={{ paddingLeft: `${depth * 12}px` }}>
            {node.sheets.map(renderSheet)}
          </div>
        )}
      </div>
    )
  }

  function renderFolder(folder: FolderNode) {
    const key = `folder:${folder.label}`
    const isOpen = !collapsed.has(key)

    return (
      <div key={folder.label}>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-foreground hover:bg-accent/50 transition-colors"
          onClick={() => toggleCollapse(key)}
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{folder.label}</span>
        </button>
        {isOpen && (
          <div className="space-y-0.5">
            {folder.workbooks.map((wb) => renderWorkbook(wb, 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border/60 bg-white/50">
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {/* Ungrouped workbooks (no folder) */}
        {ungroupedWorkbooks.map((wb) => renderWorkbook(wb))}

        {/* Folders */}
        {folders.map(renderFolder)}

        {/* Empty state */}
        {ungroupedWorkbooks.length === 0 && folders.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            아직 앱이 없습니다
          </div>
        )}
      </div>
    </aside>
  )
}
