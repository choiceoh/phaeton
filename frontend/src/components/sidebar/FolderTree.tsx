import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Grid2x2,
  Table2,
} from 'lucide-react'

import { useCollections, useWorkbooks } from '@/hooks/useCollections'
import { useFolders } from '@/hooks/useFolders'
import type { Collection, Folder as FolderType, Workbook } from '@/lib/types'

const COLLAPSED_KEY = 'phaeton:sidebar-collapsed'

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCollapsed(state: Record<string, boolean>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state))
}

interface TreeNode {
  type: 'folder' | 'workbook' | 'sheet'
  id: string
  label: string
  icon?: string
  children: TreeNode[]
}

function buildTree(
  folders: FolderType[],
  workbooks: Workbook[],
  collections: Collection[],
): TreeNode[] {
  const tree: TreeNode[] = []

  // Group workbooks by folder_id
  const wbByFolder = new Map<string, Workbook[]>()
  const unfiledWbs: Workbook[] = []
  for (const wb of workbooks) {
    if (wb.folder_id) {
      const list = wbByFolder.get(wb.folder_id) || []
      list.push(wb)
      wbByFolder.set(wb.folder_id, list)
    } else {
      unfiledWbs.push(wb)
    }
  }

  // Group collections by workbook_id
  const colsByWb = new Map<string, Collection[]>()
  const orphanCols: Collection[] = []
  for (const col of collections) {
    if (col.workbook_id) {
      const list = colsByWb.get(col.workbook_id) || []
      list.push(col)
      colsByWb.set(col.workbook_id, list)
    } else {
      orphanCols.push(col)
    }
  }

  function makeSheetNodes(wbId: string): TreeNode[] {
    return (colsByWb.get(wbId) || [])
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
      .map(col => ({
        type: 'sheet' as const,
        id: col.id,
        label: col.label,
        icon: col.icon,
        children: [],
      }))
  }

  function makeWbNode(wb: Workbook): TreeNode {
    return {
      type: 'workbook',
      id: wb.id,
      label: wb.label,
      icon: wb.icon,
      children: makeSheetNodes(wb.id),
    }
  }

  // Folders (sorted)
  const sortedFolders = [...folders]
    .filter(f => !f.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))

  for (const folder of sortedFolders) {
    const folderWbs = (wbByFolder.get(folder.id) || [])
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))

    tree.push({
      type: 'folder',
      id: folder.id,
      label: folder.label,
      icon: folder.icon,
      children: folderWbs.map(makeWbNode),
    })
  }

  // Unfiled workbooks
  for (const wb of unfiledWbs.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))) {
    tree.push(makeWbNode(wb))
  }

  // Orphan collections (no workbook)
  for (const col of orphanCols.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))) {
    tree.push({
      type: 'sheet',
      id: col.id,
      label: col.label,
      icon: col.icon,
      children: [],
    })
  }

  return tree
}

function NodeIcon({ node, isOpen }: { node: TreeNode; isOpen?: boolean }) {
  if (node.type === 'folder') {
    return isOpen
      ? <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
      : <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
  if (node.type === 'workbook') {
    return <Grid2x2 className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
  return <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

function TreeItem({
  node,
  depth,
  activeId,
  collapsed,
  onToggle,
  onNavigate,
}: {
  node: TreeNode
  depth: number
  activeId?: string
  collapsed: Record<string, boolean>
  onToggle: (id: string) => void
  onNavigate: (id: string) => void
}) {
  const isOpen = !collapsed[node.id]
  const hasChildren = node.children.length > 0
  const isActive = node.type === 'sheet' && node.id === activeId
  const pl = 8 + depth * 16

  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[13px] leading-snug transition-colors ${
          isActive
            ? 'bg-accent font-medium text-foreground'
            : 'text-foreground/80 hover:bg-accent/50'
        }`}
        style={{ paddingLeft: `${pl}px` }}
        onClick={() => {
          if (node.type === 'sheet') {
            onNavigate(node.id)
          } else {
            onToggle(node.id)
          }
        }}
      >
        {hasChildren ? (
          isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <NodeIcon node={node} isOpen={isOpen} />
        <span className="truncate">{node.label}</span>
      </button>
      {hasChildren && isOpen && (
        <div>
          {node.children.map(child => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              collapsed={collapsed}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FolderTree() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const { data: folders = [] } = useFolders()
  const { data: workbooks = [] } = useWorkbooks()
  const { data: collections = [] } = useCollections()

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)

  const tree = useMemo(
    () => buildTree(folders, workbooks, collections),
    [folders, workbooks, collections],
  )

  function handleToggle(id: string) {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] }
      saveCollapsed(next)
      return next
    })
  }

  function handleNavigate(collectionId: string) {
    navigate(`/apps/${collectionId}`)
  }

  if (!tree.length) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        앱이 없습니다
      </div>
    )
  }

  return (
    <nav className="space-y-0.5 px-1.5 py-1">
      {tree.map(node => (
        <TreeItem
          key={node.id}
          node={node}
          depth={0}
          activeId={appId}
          collapsed={collapsed}
          onToggle={handleToggle}
          onNavigate={handleNavigate}
        />
      ))}
    </nav>
  )
}
