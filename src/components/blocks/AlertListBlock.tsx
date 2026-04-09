'use client'

import { Badge, Card, List, ListItem, Text } from '@tremor/react'
import Link from 'next/link'

import type { ExpiringDocument, OverdueMilestone, StaffLoadItem } from '@/lib/types'

interface Props {
  title?: string
  alertTypes?: string[]
  overdue: OverdueMilestone[]
  expiring: ExpiringDocument[]
  overloaded: StaffLoadItem[]
}

export function AlertListBlock({
  title,
  alertTypes = ['overdue', 'expiring', 'overloaded'],
  overdue,
  expiring,
  overloaded,
}: Props) {
  const types = new Set(alertTypes)

  return (
    <div className="space-y-4">
      {title && <Text className="font-medium">{title}</Text>}

      {types.has('overdue') && overdue.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <Text className="text-sm font-medium">지연 마일스톤</Text>
            <Badge color="red">{overdue.length}</Badge>
          </div>
          <List>
            {overdue.map((m) => (
              <ListItem key={m.id}>
                <div>
                  <Text className="text-sm font-medium">{m.name}</Text>
                  <Link
                    href={`/projects/${m.project_id}`}
                    className="text-xs text-stone-500 hover:text-blue-600"
                  >
                    {m.project_name}
                  </Link>
                </div>
                <Badge color="red">{m.days_overdue}일 지연</Badge>
              </ListItem>
            ))}
          </List>
        </Card>
      )}

      {types.has('expiring') && expiring.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <Text className="text-sm font-medium">만료 임박 서류</Text>
            <Badge color="amber">{expiring.length}</Badge>
          </div>
          <List>
            {expiring.map((d) => (
              <ListItem key={d.id}>
                <div>
                  <Text className="text-sm font-medium">{d.title}</Text>
                  <Link
                    href={`/projects/${d.project_id}`}
                    className="text-xs text-stone-500 hover:text-blue-600"
                  >
                    {d.project_name}
                  </Link>
                </div>
                <Badge color="amber">{d.days_until_expiry}일 남음</Badge>
              </ListItem>
            ))}
          </List>
        </Card>
      )}

      {types.has('overloaded') && overloaded.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <Text className="text-sm font-medium">과할당 인력</Text>
            <Badge color="red">{overloaded.length}</Badge>
          </div>
          <List>
            {overloaded.map((s) => (
              <ListItem key={s.id}>
                <div>
                  <Text className="text-sm font-medium">{s.name}</Text>
                  <Text className="text-xs text-stone-500">
                    {s.role || '직무 미지정'} · {s.active_projects}개 프로젝트
                  </Text>
                </div>
                <Badge color="red">{s.total_allocation}%</Badge>
              </ListItem>
            ))}
          </List>
        </Card>
      )}

      {types.has('overdue') &&
        overdue.length === 0 &&
        types.has('expiring') &&
        expiring.length === 0 &&
        types.has('overloaded') &&
        overloaded.length === 0 && (
          <Card>
            <Text className="text-sm text-stone-400">알림 없음</Text>
          </Card>
        )}
    </div>
  )
}
