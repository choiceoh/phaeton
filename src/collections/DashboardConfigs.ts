import type { CollectionConfig } from 'payload'

export const DashboardConfigs: CollectionConfig = {
  slug: 'dashboard-configs',
  labels: { singular: '대시보드 설정', plural: '대시보드 설정' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'user', 'updatedAt'],
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (['director', 'pm'].includes(user.role as string)) return true
      return { user: { equals: user.id } }
    },
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => {
      if (!user) return false
      if (['director', 'pm'].includes(user.role as string)) return true
      return { user: { equals: user.id } }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      if (['director', 'pm'].includes(user.role as string)) return true
      return { user: { equals: user.id } }
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: '설정 이름',
      defaultValue: '내 대시보드',
      required: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      label: '사용자',
      required: true,
      index: true,
    },
    {
      name: 'layouts',
      type: 'json',
      label: '레이아웃 JSON',
      required: true,
    },
    {
      name: 'widgets',
      type: 'json',
      label: '활성 위젯 목록',
      required: true,
    },
    {
      name: 'isDefault',
      type: 'checkbox',
      label: '기본 대시보드',
      defaultValue: true,
    },
  ],
}
