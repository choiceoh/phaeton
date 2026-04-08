import { getPayload } from 'payload'

import { ProjectTableFilter } from '@/components/ProjectTableFilter'
import { getProjectProgress } from '@/lib/queries'

import config from '@payload-config'

export default async function ProjectsPage() {
  const payload = await getPayload({ config })
  const projects = await getProjectProgress(payload)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">프로젝트 목록</h1>
      <ProjectTableFilter projects={projects} />
    </div>
  )
}
