'use client'

import { Card, Text } from '@tremor/react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import type {
  ExpiringDocument,
  OverdueMilestone,
  ProjectProgress,
  StaffLoadItem,
  SummaryStats,
} from '@/lib/types'

import { AlertListBlock } from './AlertListBlock'
import { BLOCK_TYPES, getBlockTypeDef, type FieldDef } from './blockTypes'
import { ChartBlock } from './ChartBlock'
import { HeadingBlock } from './HeadingBlock'
import { ProjectListBlock } from './ProjectListBlock'
import { RichTextBlock } from './RichTextBlock'
import { StaffOverviewBlock } from './StaffOverviewBlock'
import { StatsRowBlock } from './StatsRowBlock'

// ── Types ──

export interface PageData {
  summary: SummaryStats
  projects: ProjectProgress[]
  overdue: OverdueMilestone[]
  expiring: ExpiringDocument[]
  staffLoad: StaffLoadItem[]
}

interface BlockItem {
  id: string
  blockType: string
  [key: string]: any
}

interface PageEditorProps {
  page: { id: number; title: string; slug: string; layout: BlockItem[] }
  data: PageData
  canEdit: boolean
}

// ── Helpers ──

let blockIdCounter = 0
function nextBlockId() {
  return `block-${Date.now()}-${++blockIdCounter}`
}

function filterProjects(projects: ProjectProgress[], block: BlockItem): ProjectProgress[] {
  let filtered = projects
  if (block.statusFilter?.length) {
    filtered = filtered.filter((p) => block.statusFilter.includes(p.status))
  }
  if (block.typeFilter?.length) {
    filtered = filtered.filter((p) => block.typeFilter.includes(p.type))
  }
  if (block.limit) {
    filtered = filtered.slice(0, block.limit)
  }
  return filtered
}

// ── Block Preview Renderer ──

function BlockPreview({ block, data }: { block: BlockItem; data: PageData }) {
  switch (block.blockType) {
    case 'heading':
      return <HeadingBlock text={block.text} level={block.level} description={block.description} />

    case 'rich-text':
      return block.content ? (
        <RichTextBlock content={block.content} />
      ) : (
        <Card className="border-dashed">
          <Text className="text-sm text-stone-400">
            본문 블록 — 저장 후 Admin Panel에서 편집 가능
          </Text>
        </Card>
      )

    case 'stats-row':
      return <StatsRowBlock title={block.title} summary={data.summary} />

    case 'project-list':
      return (
        <ProjectListBlock
          title={block.title}
          viewType={block.viewType}
          projects={filterProjects(data.projects, block)}
        />
      )

    case 'alert-list': {
      const limit = block.limit || 5
      return (
        <AlertListBlock
          title={block.title}
          alertTypes={block.alertTypes}
          overdue={data.overdue.slice(0, limit)}
          expiring={data.expiring.slice(0, limit)}
          overloaded={data.staffLoad
            .filter((s) => Number(s.total_allocation) > 100)
            .slice(0, limit)}
        />
      )
    }

    case 'staff-overview':
      return (
        <StaffOverviewBlock
          title={block.title}
          showOnlyOverloaded={block.showOnlyOverloaded}
          staff={data.staffLoad}
        />
      )

    case 'chart':
      return (
        <ChartBlock
          title={block.title}
          chartType={block.chartType}
          dataSource={block.dataSource}
          projects={data.projects}
          staffLoad={data.staffLoad}
        />
      )

    default:
      return null
  }
}

// ── Block Settings Form ──

function BlockSettingsForm({
  block,
  onUpdate,
}: {
  block: BlockItem
  onUpdate: (updates: Record<string, any>) => void
}) {
  const def = getBlockTypeDef(block.blockType)
  if (!def) return null

  if (def.editNote && def.fields.length === 0) {
    return <Text className="text-sm text-stone-500">{def.editNote}</Text>
  }

  return (
    <div className="space-y-3">
      {def.fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={block[field.name]}
          onChange={(val) => onUpdate({ [field.name]: val })}
        />
      ))}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: any
  onChange: (val: any) => void
}) {
  const base = 'w-full rounded border border-stone-300 bg-white px-3 py-1.5 text-sm'

  switch (field.type) {
    case 'text':
      return (
        <label className="block">
          <span className="mb-1 block text-xs text-stone-600">{field.label}</span>
          <input
            type="text"
            className={base}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )

    case 'textarea':
      return (
        <label className="block">
          <span className="mb-1 block text-xs text-stone-600">{field.label}</span>
          <textarea
            className={`${base} min-h-[60px]`}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )

    case 'number':
      return (
        <label className="block">
          <span className="mb-1 block text-xs text-stone-600">{field.label}</span>
          <input
            type="number"
            className={base}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          />
        </label>
      )

    case 'select':
      return (
        <label className="block">
          <span className="mb-1 block text-xs text-stone-600">{field.label}</span>
          <select className={base} value={value || ''} onChange={(e) => onChange(e.target.value)}>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )

    case 'multiselect': {
      const selected = new Set(Array.isArray(value) ? value : [])
      return (
        <fieldset>
          <legend className="mb-1 text-xs text-stone-600">{field.label}</legend>
          <div className="flex flex-wrap gap-2">
            {field.options?.map((opt) => (
              <label
                key={opt.value}
                className={`cursor-pointer rounded border px-2 py-1 text-xs transition ${
                  selected.has(opt.value)
                    ? 'border-stone-700 bg-stone-700 text-white'
                    : 'border-stone-300 bg-white text-stone-600 hover:border-stone-400'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected.has(opt.value)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(opt.value)
                    else next.delete(opt.value)
                    onChange([...next])
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
      )
    }

    case 'checkbox':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-stone-300"
          />
          <span className="text-sm text-stone-600">{field.label}</span>
        </label>
      )

    default:
      return null
  }
}

// ── Block Palette ──

function BlockPalette({
  onAdd,
  onClose,
}: {
  onAdd: (slug: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <Text className="font-semibold">블록 추가</Text>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            &times;
          </button>
        </div>
        <div className="space-y-2">
          {BLOCK_TYPES.map((bt) => (
            <button
              key={bt.slug}
              onClick={() => {
                onAdd(bt.slug)
                onClose()
              }}
              className="flex w-full items-center gap-3 rounded-md border border-stone-200 p-3 text-left transition hover:border-stone-400 hover:bg-stone-50"
            >
              <div>
                <Text className="text-sm font-medium">{bt.label}</Text>
                <Text className="text-xs text-stone-500">{bt.description}</Text>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Editable Block Wrapper ──

function EditableBlock({
  block,
  index,
  total,
  data,
  onMove,
  onRemove,
  onUpdate,
}: {
  block: BlockItem
  index: number
  total: number
  data: PageData
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
  onUpdate: (index: number, updates: Record<string, any>) => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const def = getBlockTypeDef(block.blockType)

  return (
    <div className="group relative rounded-lg border-2 border-dashed border-stone-300 transition hover:border-stone-400">
      {/* Block toolbar */}
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            <button
              disabled={index === 0}
              onClick={() => onMove(index, index - 1)}
              className="rounded p-0.5 text-xs text-stone-400 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-30"
              title="위로"
            >
              &#9650;
            </button>
            <button
              disabled={index === total - 1}
              onClick={() => onMove(index, index + 1)}
              className="rounded p-0.5 text-xs text-stone-400 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-30"
              title="아래로"
            >
              &#9660;
            </button>
          </div>
          <Text className="text-xs font-medium text-stone-600">{def?.label || block.blockType}</Text>
        </div>
        <div className="flex items-center gap-1">
          {def && def.fields.length > 0 && (
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`rounded px-2 py-0.5 text-xs transition ${
                settingsOpen
                  ? 'bg-stone-700 text-white'
                  : 'text-stone-500 hover:bg-stone-200 hover:text-stone-700'
              }`}
            >
              설정
            </button>
          )}
          <button
            onClick={() => onRemove(index)}
            className="rounded px-2 py-0.5 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600"
          >
            삭제
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {settingsOpen && (
        <div className="border-b border-stone-200 bg-ivory-50 p-3">
          <BlockSettingsForm block={block} onUpdate={(u) => onUpdate(index, u)} />
        </div>
      )}

      {/* Block preview */}
      <div className="p-3">
        <BlockPreview block={block} data={data} />
      </div>
    </div>
  )
}

// ── Main PageEditor ──

export function PageEditor({ page, data, canEdit }: PageEditorProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [blocks, setBlocks] = useState<BlockItem[]>(
    () => page.layout?.map((b) => ({ ...b, id: b.id || nextBlockId() })) || [],
  )
  const [showPalette, setShowPalette] = useState(false)
  const [insertIndex, setInsertIndex] = useState<number | null>(null)

  const moveBlock = useCallback((from: number, to: number) => {
    setBlocks((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const removeBlock = useCallback((index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateBlock = useCallback((index: number, updates: Record<string, any>) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...updates } : b)),
    )
  }, [])

  const addBlock = useCallback(
    (slug: string) => {
      const def = getBlockTypeDef(slug)
      if (!def) return
      const newBlock: BlockItem = {
        id: nextBlockId(),
        blockType: slug,
        ...def.defaults,
      }
      setBlocks((prev) => {
        if (insertIndex !== null) {
          const next = [...prev]
          next.splice(insertIndex, 0, newBlock)
          return next
        }
        return [...prev, newBlock]
      })
      setInsertIndex(null)
    },
    [insertIndex],
  )

  const save = useCallback(async () => {
    setSaving(true)
    try {
      // Strip client-only id field before saving
      const layout = blocks.map(({ id: _id, ...rest }) => rest)
      const res = await fetch(`/api/pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout }),
      })
      if (res.ok) {
        setEditing(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }, [blocks, page.id, router])

  const cancel = useCallback(() => {
    setBlocks(page.layout?.map((b) => ({ ...b, id: b.id || nextBlockId() })) || [])
    setEditing(false)
  }, [page.layout])

  // ── View Mode ──
  if (!editing) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{page.title}</h1>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-stone-300 bg-ivory-50 px-3 py-1.5 text-sm hover:bg-ivory-100"
            >
              편집
            </button>
          )}
        </div>
        <div className="space-y-6">
          {blocks.map((block) => (
            <BlockPreview key={block.id} block={block} data={data} />
          ))}
        </div>
      </div>
    )
  }

  // ── Edit Mode ──
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{page.title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setInsertIndex(blocks.length)
              setShowPalette(true)
            }}
            className="rounded-md border border-stone-300 bg-ivory-50 px-3 py-1.5 text-sm hover:bg-ivory-100"
          >
            + 블록 추가
          </button>
          <button
            onClick={cancel}
            className="rounded-md border border-stone-300 bg-ivory-50 px-3 py-1.5 text-sm hover:bg-ivory-100"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div className="mb-3 rounded-md border border-stone-300 bg-stone-100 px-3 py-2">
        <Text className="text-sm text-stone-700">
          블록의 순서를 바꾸고, 설정을 조정하고, 새 블록을 추가하세요. 완료 후 저장을 눌러주세요.
        </Text>
      </div>

      <div className="space-y-3">
        {blocks.map((block, i) => (
          <div key={block.id}>
            {/* Insert point before this block */}
            <button
              onClick={() => {
                setInsertIndex(i)
                setShowPalette(true)
              }}
              className="mb-2 flex w-full items-center justify-center gap-1 rounded border border-dashed border-stone-300 py-1 text-xs text-stone-400 transition hover:border-stone-500 hover:text-stone-600"
            >
              + 여기에 블록 추가
            </button>
            <EditableBlock
              block={block}
              index={i}
              total={blocks.length}
              data={data}
              onMove={moveBlock}
              onRemove={removeBlock}
              onUpdate={updateBlock}
            />
          </div>
        ))}

        {/* Insert point at the end */}
        <button
          onClick={() => {
            setInsertIndex(blocks.length)
            setShowPalette(true)
          }}
          className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-stone-300 py-2 text-sm text-stone-400 transition hover:border-stone-500 hover:text-stone-600"
        >
          + 블록 추가
        </button>
      </div>

      {showPalette && (
        <BlockPalette
          onAdd={addBlock}
          onClose={() => {
            setShowPalette(false)
            setInsertIndex(null)
          }}
        />
      )}
    </div>
  )
}
