import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { CreatePageForm } from '@/components/blocks/CreatePageForm'

import config from '@payload-config'

export const metadata = {
  title: '새 페이지 만들기 — Phaeton',
}

export default async function NewPageRoute() {
  const payload = await getPayload({ config })
  const headersList = await headers()

  let userRole: string | null = null
  try {
    const { user } = await payload.auth({ headers: headersList })
    userRole = (user?.role as string) || null
  } catch {
    // 미인증 사용자
  }

  if (!['director', 'pm'].includes(userRole as string)) {
    redirect('/projects')
  }

  return <CreatePageForm />
}
