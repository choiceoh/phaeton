import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, Network, Settings, User, ChevronDown } from 'lucide-react'

import { MICRO } from '@/lib/motion'

import NotificationBell from '@/components/common/NotificationBell'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentUser, useLogout } from '@/hooks/useAuth'
import { ROLE_LABELS } from '@/lib/constants'
import { useExcelToolbar } from '@/contexts/ExcelToolbarContext'

type RibbonTab = '홈' | '보기'

export default function ExcelRibbon() {
  const [activeTab, setActiveTab] = useState<RibbonTab>('홈')
  const { toolbarContent, pageActions, sheetTabs } = useExcelToolbar()
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()

  const isAdmin = user?.role === 'director' || user?.role === 'pm'

  const tabs: RibbonTab[] = ['홈', '보기']

  return (
    <div className="border-b border-[#d4d4d4] bg-[#f3f3f3]">
      {/* Tab headers + file menu + user controls */}
      <div className="flex items-center h-[24px] px-1 gap-0 border-b border-[#d4d4d4]">
        {/* File menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-medium text-[#333] hover:bg-[#e8e8e8] rounded-sm">
            파일
            <ChevronDown className="h-2.5 w-2.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 rounded-none">
            <DropdownMenuItem onClick={() => navigate('/apps')}>
              앱 목록
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/my-tasks')}>
              내 업무
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/automations')}>
              자동화
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/ai')}>
              AI
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/history')}>
                  이력
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/admin/users')}>
                  사용자 관리
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  설정
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout.mutate()}>
              <LogOut className="h-3.5 w-3.5 mr-2" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Divider */}
        <div className="w-px h-3.5 bg-[#d4d4d4] mx-0.5" />

        {/* Ribbon tabs */}
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`px-3 py-0.5 text-[11px] font-medium border-x border-t transition-colors ${
              activeTab === tab
                ? 'bg-white text-[#333] border-[#d4d4d4] -mb-px relative z-10'
                : 'bg-transparent text-[#666] border-transparent hover:bg-[#e8e8e8]'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: notifications + user */}
        {user && (
          <div className="flex items-center gap-1">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#e8e8e8]">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="bg-[#333] text-[9px] font-medium text-white">
                    {user.name.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[11px] text-[#333]">{user.name}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-none">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-xs font-medium">{user.name}</p>
                  <p className="text-[10px] text-[#666]">{ROLE_LABELS[user.role] ?? user.role}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 h-3.5 w-3.5" />
                  내 정보
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/admin/org')}>
                  <Network className="mr-2 h-3.5 w-3.5" />
                  조직도
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="mr-2 h-3.5 w-3.5" />
                    설정
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()}>
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex items-center gap-1 px-2 py-1 min-h-[32px]">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === '홈' && (
            <motion.div
              key="홈"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MICRO}
              className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none"
            >
              {toolbarContent}
            </motion.div>
          )}
          {activeTab === '보기' && (
            <motion.div
              key="보기"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MICRO}
              className="flex items-center gap-2 flex-1"
            >
              {pageActions}
              {sheetTabs && (
                <div className="flex items-center gap-1 border-l border-[#d4d4d4] pl-2 ml-1">
                  <span className="text-[11px] text-[#666] mr-1">저장된 보기:</span>
                  {sheetTabs}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
