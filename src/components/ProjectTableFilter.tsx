'use client'

import { Select, SelectItem, TextInput } from '@tremor/react'
import { useState } from 'react'

import { ProjectTable } from '@/components/ProjectTable'
import type { ProjectProgress } from '@/lib/types'

export function ProjectTableFilter({
  projects,
}: {
  projects: ProjectProgress[]
}) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = projects.filter(p => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()))
      return false
    return true
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <TextInput
          placeholder="프로젝트 검색..."
          value={search}
          onValueChange={setSearch}
          className="max-w-xs"
        />
        <Select
          value={typeFilter}
          onValueChange={setTypeFilter}
          className="max-w-[10rem]"
        >
          <SelectItem value="all">전체 유형</SelectItem>
          <SelectItem value="solar">태양광</SelectItem>
          <SelectItem value="wind">풍력</SelectItem>
          <SelectItem value="ess">ESS</SelectItem>
          <SelectItem value="hybrid">하이브리드</SelectItem>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="max-w-[10rem]"
        >
          <SelectItem value="all">전체 상태</SelectItem>
          <SelectItem value="planning">기획</SelectItem>
          <SelectItem value="permit">인허가</SelectItem>
          <SelectItem value="construction">시공</SelectItem>
          <SelectItem value="testing">시운전</SelectItem>
          <SelectItem value="cod">운영</SelectItem>
        </Select>
      </div>
      <ProjectTable projects={filtered} />
    </div>
  )
}
