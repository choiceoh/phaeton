'use client'

import { Select, SelectItem, TextInput } from '@tremor/react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import { ProjectTable } from '@/components/ProjectTable'
import type { ProjectProgress } from '@/lib/types'

export function ProjectTableFilter({ projects }: { projects: ProjectProgress[] }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const typeFilter = searchParams.get('type') || 'all'
  const statusFilter = searchParams.get('status') || 'all'
  const search = searchParams.get('q') || ''

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const filtered = projects.filter((p) => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextInput
          placeholder="프로젝트 검색..."
          value={search}
          onValueChange={(v) => updateFilter('q', v)}
          className="max-w-xs"
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => updateFilter('type', v)}
          className="max-w-[10rem]"
        >
          <SelectItem value="all">전체 유형</SelectItem>
          <SelectItem value="solar">태양광</SelectItem>
          <SelectItem value="rooftop">루프탑</SelectItem>
          <SelectItem value="ess">ESS</SelectItem>
          <SelectItem value="hybrid">하이브리드</SelectItem>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => updateFilter('status', v)}
          className="max-w-[10rem]"
        >
          <SelectItem value="all">전체 상태</SelectItem>
          <SelectItem value="planning">기획</SelectItem>
          <SelectItem value="permit">인허가</SelectItem>
          <SelectItem value="construction">시공</SelectItem>
          <SelectItem value="testing">시운전</SelectItem>
          <SelectItem value="cod">운영</SelectItem>
        </Select>
        <a
          href="/api/export/projects"
          download
          className="ml-auto text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700"
        >
          Excel 다운로드
        </a>
      </div>
      <ProjectTable projects={filtered} />
    </div>
  )
}
