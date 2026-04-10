import { Settings } from 'lucide-react'

import PageHeader from '@/components/common/PageHeader'
import { Card } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="설정"
        description="워크스페이스 전반 설정을 관리합니다"
      />

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <Settings className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-medium">워크스페이스 설정</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                준비 중입니다. 워크스페이스 이름, 기본 권한, 알림 설정 등을 관리할 수 있습니다.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
