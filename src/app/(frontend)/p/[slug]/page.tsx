import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { RenderBlocks } from '@/components/blocks/RenderBlocks'

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

  const page = result.docs[0]
  if (!page) notFound()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{page.title as string}</h1>
      <RenderBlocks blocks={(page as any).layout || []} />
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
