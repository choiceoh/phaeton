import { Card, Badge, List, ListItem, Text } from '@tremor/react'
import Link from 'next/link'

import type {
  OverdueMilestone,
  ExpiringDocument,
  StaffLoadItem,
} from '@/lib/types'

interface AlertPanelProps {
  overdueMilestones: OverdueMilestone[]
  expiringDocuments: ExpiringDocument[]
  overloadedStaff: StaffLoadItem[]
}

export function AlertPanel({
  overdueMilestones,
  expiringDocuments,
  overloadedStaff,
}: AlertPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Text className="font-medium">지연 마일스톤</Text>
          {overdueMilestones.length > 0 && (
            <Badge color="red">{overdueMilestones.length}</Badge>
          )}
        </div>
        {overdueMilestones.length > 0 ? (
          <List>
            {overdueMilestones.map(m => (
              <ListItem key={m.id}>
                <div>
                  <Text className="text-sm font-medium">{m.name}</Text>
                  <Link
                    href={`/projects/${m.project_id}`}
                    className="text-xs text-gray-500 hover:text-blue-600"
                  >
                    {m.project_name}
                  </Link>
                </div>
                <Badge color="red">{m.days_overdue}일 지연</Badge>
              </ListItem>
            ))}
          </List>
        ) : (
          <Text className="text-sm text-gray-400">지연 항목 없음</Text>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Text className="font-medium">만료 임박 서류</Text>
          {expiringDocuments.length > 0 && (
            <Badge color="amber">{expiringDocuments.length}</Badge>
          )}
        </div>
        {expiringDocuments.length > 0 ? (
          <List>
            {expiringDocuments.map(d => (
              <ListItem key={d.id}>
                <div>
                  <Text className="text-sm font-medium">{d.title}</Text>
                  <Link
                    href={`/projects/${d.project_id}`}
                    className="text-xs text-gray-500 hover:text-blue-600"
                  >
                    {d.project_name}
                  </Link>
                </div>
                <Badge color="amber">{d.days_until_expiry}일 남음</Badge>
              </ListItem>
            ))}
          </List>
        ) : (
          <Text className="text-sm text-gray-400">
            만료 임박 서류 없음
          </Text>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Text className="font-medium">과할당 인력</Text>
          {overloadedStaff.length > 0 && (
            <Badge color="red">{overloadedStaff.length}</Badge>
          )}
        </div>
        {overloadedStaff.length > 0 ? (
          <List>
            {overloadedStaff.map(s => (
              <ListItem key={s.id}>
                <div>
                  <Text className="text-sm font-medium">{s.name}</Text>
                  <Text className="text-xs text-gray-500">
                    {s.role || '직무 미지정'} · {s.active_projects}개
                    프로젝트
                  </Text>
                </div>
                <Badge color="red">{s.total_allocation}%</Badge>
              </ListItem>
            ))}
          </List>
        ) : (
          <Text className="text-sm text-gray-400">
            과할당 인력 없음
          </Text>
        )}
      </Card>

      <div className="text-center">
        <Link
          href="/alerts"
          className="text-sm text-blue-600 hover:underline"
        >
          전체 알림 보기
        </Link>
      </div>
    </div>
  )
}
