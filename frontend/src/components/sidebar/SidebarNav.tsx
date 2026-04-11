import { NavLink } from 'react-router'
import {
  Clock,
  MessageSquare,
  Settings,
  Users,
  Zap,
} from 'lucide-react'

import type { User } from '@/lib/types'

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
    isActive
      ? 'bg-accent font-medium text-foreground'
      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
  }`

export default function SidebarNav({ user }: { user: User }) {
  const isAdmin = user.role === 'director' || user.role === 'pm'

  return (
    <nav className="space-y-0.5 px-2">
      <NavLink to="/automations" className={navCls}>
        <Zap className="h-4 w-4" />
        자동화
      </NavLink>
      <NavLink to="/ai" className={navCls}>
        <MessageSquare className="h-4 w-4" />
        AI
      </NavLink>
      {isAdmin && (
        <>
          <div className="my-1.5 h-px bg-border" />
          <NavLink to="/history" className={navCls}>
            <Clock className="h-4 w-4" />
            이력
          </NavLink>
          <NavLink to="/admin/users" className={navCls}>
            <Users className="h-4 w-4" />
            사용자 관리
          </NavLink>
          <NavLink to="/settings" className={navCls}>
            <Settings className="h-4 w-4" />
            설정
          </NavLink>
        </>
      )}
    </nav>
  )
}
