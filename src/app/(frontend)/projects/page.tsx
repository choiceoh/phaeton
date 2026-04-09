import { getPayload } from 'payload'

import { ProjectTableFilter } from '@/components/ProjectTableFilter'
import { getProjectProgressPaginated } from '@/lib/queries'

import config from '@payload-config'

export const revalidate = 30

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function ProjectsPage({ searchParams }: Props) {
  const sp = await searchParams
  const payload = await getPayload({ config })
  const result = await getProjectProgressPaginated(payload, {
    page: sp.page ? Number(sp.page) : 1,
    limit: sp.limit ? Number(sp.limit) : 20,
    sort: sp.sort,
    type: sp.type,
    status: sp.status,
    q: sp.q,
  })

  return <ProjectTableFilter result={result} />
}
