import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: '이름' },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'viewer',
      label: '역할',
      options: [
        { label: '디렉터', value: 'director' },
        { label: 'PM', value: 'pm' },
        { label: '엔지니어', value: 'engineer' },
        { label: '열람자', value: 'viewer' },
      ],
    },
    { name: 'phone', type: 'text', label: '전화번호' },
  ],
  access: {
    create: ({ req }) => req.user?.role === 'director',
    update: ({ req, id }) => req.user?.role === 'director' || req.user?.id === id,
    delete: ({ req }) => req.user?.role === 'director',
    read: () => true,
  },
}
