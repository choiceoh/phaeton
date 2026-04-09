import { getPayload } from 'payload'

import { ProjectEditForm } from '@/components/ProjectEditForm'

import config from '@payload-config'

export default async function ProjectNewPage() {
  const payload = await getPayload({ config })

  const pmUsersRes = await payload.find({
    collection: 'users',
    where: { role: { in: ['director', 'pm'] } },
    limit: 100,
  })

  const pmUsers = pmUsersRes.docs.map((u) => ({
    id: u.id as number,
    name: u.name,
  }))

  return (
    <ProjectEditForm
      isNew
      pmUsers={pmUsers}
      initial={{
        name: '',
        type: 'solar',
        status: 'gen-permit',
      }}
    />
  )
}
