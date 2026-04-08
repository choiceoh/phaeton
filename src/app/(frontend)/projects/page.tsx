import { ProjectTableFilter } from '@/components/ProjectTableFilter'
import { getCachedProjectProgress } from '@/lib/cachedQueries'

export const revalidate = 30

export default async function ProjectsPage() {
  const projects = await getCachedProjectProgress()

  return <ProjectTableFilter projects={projects} />
}
