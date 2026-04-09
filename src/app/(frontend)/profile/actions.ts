'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'

export interface UpdateProfileData {
  name: string
  phone?: string
  department?: string
}

export async function updateProfile(data: UpdateProfileData) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return { error: '인증이 필요합니다.' }

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        name: data.name,
        phone: data.phone || undefined,
        department: data.department || undefined,
      },
    })

    // Staff 레코드도 함께 업데이트
    const staffRes = await payload.find({
      collection: 'staff',
      where: { user: { equals: user.id } },
      limit: 1,
    })
    if (staffRes.docs.length > 0) {
      await payload.update({
        collection: 'staff',
        id: staffRes.docs[0].id,
        data: {
          name: data.name,
          phone: data.phone || undefined,
        },
      })
    }

    revalidatePath('/profile')
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : '프로필 수정에 실패했습니다'
    return { error: message }
  }
}
