import { useNavigate } from 'react-router'
import { LogOut, Network, Settings, User, ChevronDown, FileSpreadsheet, Download, FileText, Mail, Upload } from 'lucide-react'

import NotificationBell from '@/components/common/NotificationBell'
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
import { useCurrentUser, useLogout } from '@/hooks/useAuth'
import { ROLE_LABELS } from '@/lib/constants'
import { useExcelToolbar } from '@/contexts/ExcelToolbarContext'

export default function TitleBar() {
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()
  const { workbookLabel, collectionLabel, fileMenuActions } = useExcelToolbar()

  if (!user) return null

  const isAdmin = user.role === 'director' || user.role === 'pm'

  const title = workbookLabel
    ? `${workbookLabel} - ${collectionLabel}`
    : collectionLabel || 'Topworks'

  return (
    <div className="flex items-center h-[30px] bg-[#e6e6e6] border-b border-[#d4d4d4] px-2 text-[11px] select-none">
      {/* File menu */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-0.5 px-2 py-0.5 rounded hover:bg-[#d0d0d0] text-[#333] font-medium">
          파일
          <ChevronDown className="h-2.5 w-2.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 rounded-none">
          <DropdownMenuItem onClick={() => navigate('/apps')}>
            앱 목록
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/ai')}>
            AI
          </DropdownMenuItem>
          {fileMenuActions.onXlsxExport && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={fileMenuActions.onXlsxExport}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
                Excel 내보내기
              </DropdownMenuItem>
              <DropdownMenuItem onClick={fileMenuActions.onCsvExport}>
                <Download className="h-3.5 w-3.5 mr-2" />
                CSV 내보내기
              </DropdownMenuItem>
              <DropdownMenuItem onClick={fileMenuActions.onPdfExport}>
                <FileText className="h-3.5 w-3.5 mr-2" />
                PDF 내보내기
              </DropdownMenuItem>
              <DropdownMenuItem onClick={fileMenuActions.onEmailReport}>
                <Mail className="h-3.5 w-3.5 mr-2" />
                이메일 리포트
              </DropdownMenuItem>
              {fileMenuActions.canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={fileMenuActions.onImport}>
                    <Upload className="h-3.5 w-3.5 mr-2" />
                    가져오기
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
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

      {/* Center: title */}
      <div className="flex-1 text-center text-[11px] text-[#666] truncate">
        {title}
      </div>

      {/* Right: user controls */}
      <div className="flex items-center gap-1">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#d0d0d0]">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="bg-[#333] text-[9px] font-medium text-white">
                {user.name.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-[#333]">{user.name}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-none">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="text-xs font-medium">{user.name}</p>
                <p className="text-[10px] text-[#666]">{ROLE_LABELS[user.role] ?? user.role}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
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
    </div>
  )
}
