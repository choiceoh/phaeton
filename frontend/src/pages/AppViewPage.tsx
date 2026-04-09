import { useEffect, useState } from 'react'
import { useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import EntrySheet from '@/components/works/EntrySheet'
import ViewTabs from '@/components/works/views/ViewTabs'
import { api } from '@/lib/api'
import type { Collection, ListEnvelope } from '@/lib/types'

export default function AppViewPage() {
  const { appId } = useParams()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [entries, setEntries] = useState<Record<string, unknown>[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<Record<string, unknown> | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!appId) return
    setError('')
    api
      .get<Collection>(`/schema/collections/${appId}`)
      .then((c) => {
        setCollection(c)
        return api.getRaw<ListEnvelope<Record<string, unknown>>>(`/data/${c.slug}`)
      })
      .then((r) => setEntries(r.data || []))
      .catch((e) => setError(e.message || '로딩 실패'))
  }, [appId])

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }
  if (!collection) {
    return <p className="text-sm text-muted-foreground">로딩 중...</p>
  }

  async function handleCreate(data: Record<string, unknown>) {
    if (!collection) return
    setSubmitting(true)
    try {
      await api.post(`/data/${collection.slug}`, data)
      const r = await api.getRaw<ListEnvelope<Record<string, unknown>>>(`/data/${collection.slug}`)
      setEntries(r.data || [])
    } finally {
      setSubmitting(false)
    }
  }

  function handleEntryClick(entry: Record<string, unknown>) {
    setEditEntry(entry)
    setSheetOpen(true)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{collection.label}</h1>
          {collection.description && (
            <p className="mt-1 text-sm text-muted-foreground">{collection.description}</p>
          )}
        </div>
        <Button
          onClick={() => {
            setEditEntry(undefined)
            setSheetOpen(true)
          }}
        >
          새 항목
        </Button>
      </div>

      <ViewTabs
        fields={collection.fields || []}
        entries={entries}
        onEntryClick={handleEntryClick}
      />

      <EntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        fields={collection.fields || []}
        initialData={editEntry}
        onSubmit={handleCreate}
        submitting={submitting}
        title={editEntry ? '항목 편집' : '새 항목'}
      />
    </div>
  )
}
