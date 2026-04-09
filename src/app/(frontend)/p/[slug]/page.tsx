import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { PageEditor, type PageData } from '@/components/blocks/PageEditor'
import { RenderBlocks } from '@/components/blocks/RenderBlocks'
import {
  getCachedExpiringDocuments,
  getCachedOverdueMilestones,
  getCachedProjectProgress,
  getCachedStaffLoad,
  getCachedSummaryStats,
} from '@/lib/cachedQueries'

import config from '@payload-config'

export const revalidate = 60

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function DynamicPage({ params }: PageProps) {
  const { slug } = await params
  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'pages' as any,
    where: {
      slug: { equals: slug },
      status: { equals: 'published' },
    },
    limit: 1,
  })

  const page = result.docs[0] as any
  if (!page) notFound()

  // Check user role
  const headersList = await headers()
  let userRole: string | null = null
  try {
    const { user } = await payload.auth({ headers: headersList })
    userRole = (user?.role as string) || null
  } catch {
    // 미인증 사용자
  }

  const canEdit = ['director', 'pm'].includes(userRole as string)

  // For editors: pass data to client for live preview while editing
  if (canEdit) {
    const [summary, projects, overdue, expiring, staffLoad] = await Promise.all([
      getCachedSummaryStats(),
      getCachedProjectProgress(),
      getCachedOverdueMilestones(),
      getCachedExpiringDocuments(),
      getCachedStaffLoad(),
    ])

    const data: PageData = { summary, projects, overdue, expiring, staffLoad }

    return (
      <PageEditor
        page={{
          id: page.id,
          title: page.title,
          slug: page.slug,
          layout: page.layout || [],
        }}
        data={data}
        canEdit
      />
    )
  }

  // For viewers: server-rendered blocks (optimal performance)
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{page.title as string}</h1>
      <RenderBlocks blocks={page.layout || []} />
    </div>
  )
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'pages' as any,
    where: {
      slug: { equals: slug },
      status: { equals: 'published' },
    },
    limit: 1,
  })

  const page = result.docs[0]
  return {
    title: page ? `${page.title} — Phaeton` : '페이지를 찾을 수 없습니다',
  }
}
