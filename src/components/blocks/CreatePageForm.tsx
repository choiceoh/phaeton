'use client'

import { Card, Text } from '@tremor/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function CreatePageForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const autoSlug = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !slug.trim()) return

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          status: 'published',
          showInNav: false,
          layout: [],
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.errors?.[0]?.message || '페이지 생성에 실패했습니다')
        return
      }

      const data = await res.json()
      const newSlug = data.doc?.slug || slug.trim()
      router.push(`/p/${newSlug}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">새 페이지 만들기</h1>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">페이지 제목</span>
            <input
              type="text"
              className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (!slug || slug === autoSlug(title)) {
                  setSlug(autoSlug(e.target.value))
                }
              }}
              placeholder="예: 태양광 현황 리포트"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">URL 슬러그</span>
            <div className="flex items-center gap-1">
              <Text className="text-sm text-stone-500">/p/</Text>
              <input
                type="text"
                className="flex-1 rounded border border-stone-300 bg-white px-3 py-2 text-sm"
                value={slug}
                onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9가-힣-]/g, ''))}
                placeholder="solar-report"
                required
              />
            </div>
          </label>

          {error && (
            <Text className="text-sm text-red-600">{error}</Text>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-md border border-stone-300 bg-ivory-50 px-4 py-2 text-sm hover:bg-ivory-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || !slug.trim()}
              className="rounded-md bg-stone-700 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {saving ? '생성 중...' : '페이지 생성'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
