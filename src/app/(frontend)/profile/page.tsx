import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { ProfileForm } from '@/components/ProfileForm'

import config from '@payload-config'

export default async function ProfilePage() {
  const payload = await getPayload({ config })

  let user
  try {
    const result = await payload.auth({ headers: await headers() })
    user = result.user
  } catch {
    /* 개발 단계 */
  }

  if (!user) redirect('/admin/login')

  const u = user as {
    id: number
    name: string
    email: string
    phone?: string
    department?: string
    role?: string
  }

  return (
    <ProfileForm
      user={{
        id: u.id,
        name: u.name ?? '',
        email: u.email ?? '',
        phone: u.phone ?? null,
        department: u.department ?? null,
        role: u.role ?? 'viewer',
      }}
    />
  )
}
