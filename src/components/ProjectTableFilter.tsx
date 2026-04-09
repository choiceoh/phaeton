'use client'

import { Select, SelectItem, TextInput } from '@tremor/react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

import { ColumnSettings } from '@/components/ColumnSettings'
import { ProjectTable } from '@/components/ProjectTable'
import type { PaginatedResult, ProjectProgress } from '@/lib/types'
import { useColumnPrefs } from '@/lib/useColumnPrefs'

export function ProjectTableFilter({ result }: { result: PaginatedResult<ProjectProgress> }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { visibleKeys } = useColumnPrefs()

  const typeFilter = searchParams.get('type') || 'all'
  const statusFilter = searchParams.get('status') || 'all'
  const search = searchParams.get('q') || ''
  const currentSort = searchParams.get('sort') || ''

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    if (key !== 'page') params.delete('page')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function handleSort(column: string) {
    const desc = currentSort === column
    updateParam('sort', desc ? `-${column}` : column)
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (page <= 1) {
      params.delete('page')
    } else {
      params.set('page', String(page))
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const exportParams = new URLSearchParams()
  if (typeFilter !== 'all') exportParams.set('type', typeFilter)
  if (statusFilter !== 'all') exportParams.set('status', statusFilter)
  if (search) exportParams.set('q', search)
  const exportQuery = exportParams.toString()

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextInput
          placeholder="프로젝트 검색..."
          value={search}
          onValueChange={(v) => updateParam('q', v)}
          className="max-w-xs"
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => updateParam('type', v)}
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
          onValueChange={(v) => updateParam('status', v)}
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
        <div className="ml-auto flex items-center gap-4">
          <ColumnSettings />
          <a
            href={`/api/export/projects${exportQuery ? `?${exportQuery}` : ''}`}
            download
            className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700"
          >
            프로젝트 내보내기
          </a>
          <a
            href="/api/export/milestones"
            download
            className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700"
          >
            마일스톤 내보내기
          </a>
        </div>
      </div>

      <ProjectTable
        projects={result.docs}
        visibleKeys={visibleKeys}
        sort={currentSort}
        onSort={handleSort}
      />

      {result.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={result.page <= 1}
            onClick={() => goToPage(result.page - 1)}
            className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-sm text-stone-600">
            {result.page} / {result.totalPages} 페이지
            <span className="ml-2 text-stone-400">(총 {result.totalDocs}건)</span>
          </span>
          <button
            disabled={result.page >= result.totalPages}
            onClick={() => goToPage(result.page + 1)}
            className="rounded border border-stone-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}
