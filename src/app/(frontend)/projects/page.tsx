import { getPayload } from 'payload'

import { ProjectTableFilter } from '@/components/ProjectTableFilter'
import { getProjectProgress } from '@/lib/queries'

import config from '@payload-config'

export default async function ProjectsPage() {
  const payload = await getPayload({ config })
  const projects = await getProjectProgress(payload)

  return (
    <ProjectTableFilter projects={projects} />
  )
}
