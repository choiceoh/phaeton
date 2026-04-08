'use client'


import { Select, SelectItem, TextInput } from '@tremor/react'
import Link from 'next/link'
import { useState } from 'react'

import { ProjectCard } from '@/components/ProjectCard'
import type { ProjectProgress } from '@/lib/types'

export function ProjectGrid({
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
          <SelectItem value="gen-permit">발전허가</SelectItem>
          <SelectItem value="dev-permit">개발허가</SelectItem>
          <SelectItem value="civil">토목</SelectItem>
          <SelectItem value="structural-elec">구조물 및 전기공사</SelectItem>
          <SelectItem value="inspection">사용전 검사</SelectItem>
          <SelectItem value="pre-cod">준공대기</SelectItem>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(p => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <ProjectCard project={p} />
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          조건에 맞는 프로젝트가 없습니다.
        </p>
      )}
    </div>
  )
}
