import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
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
import { useCollection } from '@/hooks/useCollections'
import {
  useCreateEntry,
  useDeleteEntry,
  useEntries,
  useUpdateEntry,
} from '@/hooks/useEntries'
import { formatError } from '@/lib/api'
import { formatCell } from '@/lib/formatCell'

const PAGE_SIZE = 20

export default function AppViewPage() {
  const { appId } = useParams()
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<Record<string, unknown> | undefined>()
  const [deleteId, setDeleteId] = useState<string | null>(null)

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

