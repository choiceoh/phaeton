/**
 * Local-mode entries hook for collections with ≤5,000 rows.
 *
 * Fetches the entire dataset in a single bulk request, then applies
 * filtering, sorting, and pagination entirely client-side via useMemo.
 * This eliminates 200–500ms server roundtrips on every filter/sort change.
 *
 * Falls back gracefully: when slug is undefined the query is disabled,
 * allowing AppViewPage to conditionally enable local vs server mode.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SortingState } from '@tanstack/react-table'

import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { applyFilters, applyTextSearch } from '@/lib/localFilter'
import { applySort, type LocalSortItem } from '@/lib/localSort'
import type { EntryRow, Field, FilterGroup } from '@/lib/types'
import { isFilterGroupEmpty } from '@/lib/types'
import type { EntryListResult } from '@/hooks/useEntries'
import type { SortItem } from '@/components/works/SortPanel'

const BULK_LIMIT = 5000

export interface UseLocalEntriesParams {
  page: number
  limit: number
  filterGroup: FilterGroup
  sortItems: SortItem[]
  sorting: SortingState
  searchText: string
  fields: Field[]
}

export function useLocalEntries(
  slug: string | undefined,
  params: UseLocalEntriesParams,
) {
  const { page, limit, filterGroup, sortItems, sorting, searchText, fields } = params

  // Fetch all rows once via bulk endpoint.
  const {
    data: bulkData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.entries.bulk(slug ?? ''),
    queryFn: () =>
      api.getList<EntryRow>(
        `/data/${slug}?_bulk=true&limit=${BULK_LIMIT}&expand=auto`,
      ),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  })

  const allRows = bulkData?.data ?? []

  // Build unified sort items from either sort panel or column header sorting.
  const effectiveSortItems: LocalSortItem[] = useMemo(() => {
    if (sortItems.length > 0) return sortItems
    if (sorting.length > 0) {
      return sorting.map((s) => ({ field: s.id, desc: s.desc }))
    }
    return []
  }, [sortItems, sorting])

  // Client-side pipeline: search → filter → sort → paginate.
  const result: EntryListResult | undefined = useMemo(() => {
    if (!bulkData) return undefined

    let rows = allRows

    // 1. Text search
    if (searchText.trim()) {
      rows = applyTextSearch(rows, searchText, fields)
    }

    // 2. Filter
    if (!isFilterGroupEmpty(filterGroup)) {
      rows = applyFilters(rows, filterGroup, fields)
    }

    // 3. Sort
    if (effectiveSortItems.length > 0) {
      rows = applySort(rows, effectiveSortItems, fields)
    }

    // 4. Paginate
    const total = rows.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * limit
    const data = rows.slice(start, start + limit)

    return { data, total, page: safePage, limit, total_pages: totalPages }
  }, [allRows, bulkData, searchText, filterGroup, fields, effectiveSortItems, page, limit])

  return {
    data: result,
    allRows,
    isLoading,
    isError,
    error,
    refetch,
  }
}
