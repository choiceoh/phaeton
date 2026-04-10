import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Building2, User as UserIcon } from 'lucide-react'

import type { Department, User } from '@/lib/types'

interface OrgTreeProps {
  departments: Department[]
  users: User[]
  /** If provided, clicking a user or department calls this handler. */
  onSelectUser?: (user: User) => void
  onSelectDepartment?: (dept: Department) => void
  /** Highlight these IDs. */
  selectedUserId?: string
  selectedDeptId?: string
  /** Show users under their departments? Default true. */
  showUsers?: boolean
}

interface DeptNode {
  dept: Department
  children: DeptNode[]
  users: User[]
}

export default function OrgTree({
  departments,
  users,
  onSelectUser,
  onSelectDepartment,
  selectedUserId,
  selectedDeptId,
  showUsers = true,
}: OrgTreeProps) {
  const tree = useMemo(() => buildTree(departments, showUsers ? users : []), [departments, users, showUsers])
  const unassigned = useMemo(
    () => (showUsers ? users.filter((u) => !u.department_id) : []),
    [users, showUsers],
  )

  return (
    <div className="space-y-0.5 text-sm">
      {tree.map((node) => (
        <DeptBranch
          key={node.dept.id}
          node={node}
          depth={0}
          onSelectUser={onSelectUser}
          onSelectDepartment={onSelectDepartment}
          selectedUserId={selectedUserId}
          selectedDeptId={selectedDeptId}
        />
      ))}
      {unassigned.length > 0 && (
        <div className="mt-2">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">미배정</p>
          {unassigned.map((u) => (
            <UserLeaf
              key={u.id}
              user={u}
              depth={1}
              selected={u.id === selectedUserId}
              onClick={onSelectUser}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DeptBranch({
  node,
  depth,
  onSelectUser,
  onSelectDepartment,
  selectedUserId,
  selectedDeptId,
}: {
  node: DeptNode
  depth: number
  onSelectUser?: (user: User) => void
  onSelectDepartment?: (dept: Department) => void
  selectedUserId?: string
  selectedDeptId?: string
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0 || node.users.length > 0
  const isSelected = node.dept.id === selectedDeptId

  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-stone-100 ${
          isSelected ? 'bg-stone-100 font-medium' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (onSelectDepartment) {
            onSelectDepartment(node.dept)
          } else {
            setExpanded(!expanded)
          }
        }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <Building2 className="h-3.5 w-3.5 shrink-0 text-stone-500" />
        <span className="truncate" title={node.dept.name}>{node.dept.name}</span>
        {node.users.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{node.users.length}</span>
        )}
      </button>
      {expanded && (
        <>
          {node.children.map((child) => (
            <DeptBranch
              key={child.dept.id}
              node={child}
              depth={depth + 1}
              onSelectUser={onSelectUser}
              onSelectDepartment={onSelectDepartment}
              selectedUserId={selectedUserId}
              selectedDeptId={selectedDeptId}
            />
          ))}
          {node.users.map((u) => (
            <UserLeaf
              key={u.id}
              user={u}
              depth={depth + 1}
              selected={u.id === selectedUserId}
              onClick={onSelectUser}
            />
          ))}
        </>
      )}
    </div>
  )
}

function UserLeaf({
  user,
  depth,
  selected,
  onClick,
}: {
  user: User
  depth: number
  selected: boolean
  onClick?: (user: User) => void
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-stone-100 ${
        selected ? 'bg-stone-100 font-medium' : ''
      } ${!user.is_active ? 'opacity-50' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={() => onClick?.(user)}
      disabled={!onClick}
    >
      <span className="w-3.5" />
      <UserIcon className="h-3.5 w-3.5 shrink-0 text-stone-400" />
      <span className="truncate" title={user.name}>{user.name}</span>
      {user.position && (
        <span className="ml-1 text-xs text-muted-foreground">{user.position}</span>
      )}
    </button>
  )
}

function buildTree(departments: Department[], users: User[]): DeptNode[] {
  const nodeMap = new Map<string, DeptNode>()
  for (const d of departments) {
    nodeMap.set(d.id, { dept: d, children: [], users: [] })
  }

  // Assign users to their department node.
  for (const u of users) {
    if (u.department_id) {
      const node = nodeMap.get(u.department_id)
      if (node) node.users.push(u)
    }
  }

  // Build parent-child relationships.
  const roots: DeptNode[] = []
  for (const node of nodeMap.values()) {
    if (node.dept.parent_id) {
      const parent = nodeMap.get(node.dept.parent_id)
      if (parent) {
        parent.children.push(node)
        continue
      }
    }
    roots.push(node)
  }

  // Sort children by sort_order then name.
  const sortNodes = (nodes: DeptNode[]) => {
    nodes.sort((a, b) => a.dept.sort_order - b.dept.sort_order || a.dept.name.localeCompare(b.dept.name))
    for (const n of nodes) sortNodes(n.children)
  }
  sortNodes(roots)

  return roots
}
