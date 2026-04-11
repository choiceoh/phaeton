import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { LogOut, PanelLeftClose, PanelLeftOpen, Plus, User } from 'lucide-react'

import { BASE } from '@/lib/motion'

import NotificationBell from '@/components/common/NotificationBell'
import FolderTree from './FolderTree'
import SidebarNav from './SidebarNav'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLogout } from '@/hooks/useAuth'
import { ROLE_LABELS } from '@/lib/constants'
import type { User as UserType } from '@/lib/types'

const SIDEBAR_WIDTH_KEY = 'phaeton:sidebar-width'
const SIDEBAR_COLLAPSED_KEY = 'phaeton:sidebar-open'
const DEFAULT_WIDTH = 240
const MIN_WIDTH = 200
const MAX_WIDTH = 400

function getInitialWidth(): number {
  try {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    return stored ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Number(stored))) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

function getInitialOpen(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    return stored !== 'false'
  } catch {
    return true
  }
}

export default function AppSidebar({ user }: { user: UserType }) {
  const navigate = useNavigate()
  const logout = useLogout()
  const [width, setWidth] = useState(getInitialWidth)
  const [isOpen, setIsOpen] = useState(getInitialOpen)
  const [isResizing, setIsResizing] = useState(false)

  function handleToggle() {
    const next = !isOpen
    setIsOpen(next)
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
  }

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startW = width

    function onMove(ev: MouseEvent) {
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + ev.clientX - startX))
      setWidth(newW)
    }

    function onUp() {
      setIsResizing(false)
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width))
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <motion.div
      className="relative flex h-full shrink-0 flex-col border-r border-border/60 bg-white overflow-hidden"
      animate={{ width: isOpen ? width : 40 }}
      transition={BASE}
    >
      {/* Collapsed: toggle button only */}
      {!isOpen && (
        <div className="flex h-full flex-col items-center py-2">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={handleToggle}
            title="사이드바 열기"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Expanded content */}
      {isOpen && (
        <>
          {/* Header: Logo + collapse toggle */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <Link to="/" className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-[9px] font-bold text-white shadow-sm">T</span>
              <span>Topworks</span>
            </Link>
            <div className="flex items-center gap-0.5">
              <NotificationBell />
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={handleToggle}
                title="사이드바 접기"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* New app button */}
          {(user.role === 'director' || user.role === 'pm') && (
            <div className="px-2.5 pb-1">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                onClick={() => navigate('/apps/new')}
              >
                <Plus className="h-3.5 w-3.5" />
                새 앱
              </button>
            </div>
          )}

          {/* Tree */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
            <FolderTree />
          </div>

          {/* Bottom nav links */}
          <div className="border-t border-border/60 py-2">
            <SidebarNav user={user} />
          </div>

          {/* User menu */}
          <div className="border-t border-border/60 px-2.5 py-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-foreground text-[10px] font-medium text-white">
                    {user.name.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="mr-2 h-4 w-4" />
                    내 정보
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Resize handle */}
          <div
            className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors duration-150 hover:bg-primary/20 ${isResizing ? 'bg-primary/30' : ''}`}
            onMouseDown={handleMouseDown}
          />
        </>
      )}
    </motion.div>
  )
}
