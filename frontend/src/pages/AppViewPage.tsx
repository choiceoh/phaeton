import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog'
import { DataTable } from '@/components/common/DataTable'
import ErrorState from '@/components/common/ErrorState'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import RoleGate from '@/components/common/RoleGate'
import EntrySheet from '@/components/works/EntrySheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCollection } from '@/hooks/useCollections'
import {
  useCreateEntry,
  useDeleteEntry,
  useEntries,
  useUpdateEntry,
} from '@/hooks/useEntries'
import { formatError } from '@/lib/api'
import type { Field } from '@/lib/types'

const PAGE_SIZE = 20

export default function AppViewPage() {
  const { appId } = useParams()
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([])
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<Record<string, unknown> | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: collection, isLoading: colLoading, isError: colError, error: colErr } =
    useCollection(appId)

  // Build expand string from all relation fields so we get labels not UUIDs.
  const expand = useMemo(() => {
    if (!collection?.fields) return undefined
    const rels = collection.fields.filter((f) => f.field_type === 'relation').map((f) => f.slug)
    return rels.length > 0 ? rels.join(',') : undefined
  }, [collection])

  const sortParam = useMemo(() => {
    if (sorting.length === 0) return undefined
    return sorting.map((s) => `${s.desc ? '-' : ''}${s.id}`).join(',')
  }, [sorting])

  const filters = useMemo(() => {
    if (!search) return undefined
    return { q: search }
  }, [search])

  const {
    data: list,
    isLoading: entriesLoading,
    isError: entriesError,
    error: entriesErr,
    refetch,
  } = useEntries(collection?.slug, {
    page,
    limit: PAGE_SIZE,
    sort: sortParam,
    expand,
    filters,
  })

  const createEntry = useCreateEntry(collection?.slug ?? '')
  const updateEntry = useUpdateEntry(collection?.slug ?? '')
  const deleteEntry = useDeleteEntry(collection?.slug ?? '')

  // Build columns from collection.fields. Each column reads its value via the
  // field slug; relation columns prefer the expanded object's `name`/`title`.
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!collection?.fields) return []
    const cols: ColumnDef<Record<string, unknown>>[] = collection.fields.slice(0, 8).map((f) => ({
      id: f.slug,
      header: f.label,
      enableSorting: true,
      cell: ({ row }) => formatCell(row.original[f.slug], f),
    }))
    cols.push({
      id: 'created_at',
      header: '작성일',
      enableSorting: true,
      cell: ({ row }) => {
        const v = row.original.created_at
        if (!v) return '-'
        return new Date(v as string).toLocaleDateString('ko')
      },
    })
    cols.push({
      id: '_actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <RoleGate roles={['director', 'pm']}>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setDeleteId(String(row.original.id))
            }}
          >
            삭제
          </Button>
        </RoleGate>
      ),
    })
    return cols
  }, [collection])

  if (colLoading) return <LoadingState />
  if (colError) return <ErrorState error={colErr} />
  if (!collection) return null

  function handleSubmit(data: Record<string, unknown>) {
    if (editEntry?.id) {
      updateEntry.mutate(
        { id: String(editEntry.id), body: data },
        {
          onSuccess: () => toast.success('수정되었습니다'),
          onError: (err) => toast.error(formatError(err)),
        },
      )
    } else {
      createEntry.mutate(data, {
        onSuccess: () => toast.success('생성되었습니다'),
        onError: (err) => toast.error(formatError(err)),
      })
    }
  }

  function handleDelete() {
    if (!deleteId) return
    deleteEntry.mutate(deleteId, {
      onSuccess: () => {
        toast.success('삭제되었습니다')
        setDeleteId(null)
      },
      onError: (err) => toast.error(formatError(err)),
    })
  }

  const handleExportCSV = useCallback(() => {
    if (!collection) return
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (sortParam) params.set('sort', sortParam)
    const qs = params.toString()
    const url = `/api/data/${collection.slug}/export.csv${qs ? `?${qs}` : ''}`
    window.open(url, '_blank')
  }, [collection, search, sortParam])

  const handleImportCSV = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !collection) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`/api/data/${collection.slug}/import`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || body.message || res.statusText)
      }
      const result = await res.json()
      toast.success(`${result.data?.imported ?? 0}건 가져왔습니다`)
      refetch()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      e.target.value = ''
    }
  }, [collection, refetch])

  return (
    <div>
      <PageHeader
        title={collection.label}
        description={collection.description}
        actions={
          <>
            <RoleGate roles={['director', 'pm']}>
              <Link to={`/apps/${collection.id}/settings`}>
                <Button variant="outline">설정</Button>
              </Link>
            </RoleGate>
            <Button
              onClick={() => {
                setEditEntry(undefined)
                setSheetOpen(true)
              }}
            >
              새 항목
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Input
          placeholder="검색..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="max-w-xs"
        />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            CSV 내보내기
          </Button>
          <RoleGate roles={['director', 'pm']}>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              CSV 가져오기
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportCSV}
            />
          </RoleGate>
        </div>
      </div>

      {entriesLoading && !list && <LoadingState />}
      {entriesError && <ErrorState error={entriesErr} onRetry={() => refetch()} />}

      {list && (
        <DataTable
          columns={columns}
          data={list.data}
          total={list.total}
          page={page}
          limit={PAGE_SIZE}
          onPageChange={setPage}
          onSortChange={setSorting}
          onRowClick={(row) => {
            setEditEntry(row)
            setSheetOpen(true)
          }}
          emptyTitle="아직 항목이 없습니다"
          emptyDescription='"새 항목" 버튼을 눌러 첫 데이터를 입력하세요.'
        />
      )}

      <EntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        fields={collection.fields ?? []}
        initialData={editEntry}
        onSubmit={handleSubmit}
        submitting={createEntry.isPending || updateEntry.isPending}
        title={editEntry ? '항목 편집' : '새 항목'}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="항목을 삭제하시겠습니까?"
        description="삭제된 항목은 휴지통에서 복구할 수 있습니다."
        variant="destructive"
        confirmLabel="삭제"
        onConfirm={handleDelete}
        loading={deleteEntry.isPending}
      />
    </div>
  )
}

function formatCell(value: unknown, field: Field): string {
  if (value == null) return '-'
  // Expanded relation: backend returns the full object, not just the id
  if (field.field_type === 'relation' && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return String(obj.name ?? obj.title ?? obj.label ?? obj.id ?? '?')
  }
  // Expanded user: backend auto-expands to {id, name, email}
  if (field.field_type === 'user' && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return String(obj.name ?? obj.email ?? obj.id ?? '?')
  }
  if (field.field_type === 'boolean') return value ? '✓' : '-'
  if (field.field_type === 'date' || field.field_type === 'datetime') {
    return new Date(value as string).toLocaleDateString('ko')
  }
  if (field.field_type === 'time') return String(value)
  if (field.field_type === 'multiselect' && Array.isArray(value)) {
    return value.join(', ')
  }
  if (field.field_type === 'json') return JSON.stringify(value)
  return String(value)
}
