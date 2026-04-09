'use client'

import { Text } from '@tremor/react'

import { StaffTable } from '@/components/StaffTable'
import type { StaffLoadItem } from '@/lib/types'

interface Props {
  title?: string
  showOnlyOverloaded?: boolean
  staff: StaffLoadItem[]
}

export function StaffOverviewBlock({ title, showOnlyOverloaded, staff }: Props) {
  const filtered = showOnlyOverloaded
    ? staff.filter((s) => Number(s.total_allocation) > 100)
    : staff

  return (
    <div>
      {title && <Text className="mb-3 font-medium">{title}</Text>}
      <StaffTable staff={filtered} />
    </div>
  )
}
