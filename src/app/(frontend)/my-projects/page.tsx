import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { MyMilestoneList } from '@/components/MyMilestoneList'
import { getMyMilestones } from '@/lib/queries'

import config from '@payload-config'

export default async function MyProjectsPage() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/admin/login')

  const milestones = await getMyMilestones(payload, user.id as number)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">내 업무</h1>
        <p className="mt-1 text-sm text-gray-500">
          배치된 프로젝트의 마일스톤을 다음 단계로 진행할 수 있습니다.
        </p>
      </div>
      <MyMilestoneList milestones={milestones} />
    </div>
  )
}
