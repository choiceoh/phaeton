import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

import { Users } from './src/collections/Users.ts'
import { Projects } from './src/collections/Projects.ts'
import { MilestoneTemplates } from './src/collections/MilestoneTemplates.ts'
import { ProjectMilestones } from './src/collections/ProjectMilestones.ts'
import { Staff } from './src/collections/Staff.ts'
import { StaffAssignments } from './src/collections/StaffAssignments.ts'
import { ProjectDocuments } from './src/collections/ProjectDocuments.ts'
import { SiteSettings } from './src/globals/SiteSettings.ts'
import { checkOverdueHandler } from './src/jobs/checkOverdue.ts'
import { checkExpiringDocsHandler } from './src/jobs/checkExpiringDocs.ts'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— Phaeton',
    },
    dateFormat: 'yyyy-MM-dd',
    components: {
      afterNavLinks: ['@/components/AdminBackLink'],
    },
    livePreview: {
      url: ({ data, collectionConfig }) => {
        const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        if (collectionConfig?.slug === 'projects') return `${base}/projects/${data.id}`
        return `${base}/dashboard`
      },
      collections: ['projects'],
      globals: ['site-settings'],
    },
  },

  i18n: {
    fallbackLanguage: 'ko',
  },

  collections: [
    Users,
    Projects,
    MilestoneTemplates,
    ProjectMilestones,
    Staff,
    StaffAssignments,
    ProjectDocuments,
  ],

  globals: [SiteSettings],

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    push: true,
  }),

  editor: lexicalEditor({}),

  cors: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'],

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  jobs: {
    tasks: [
      {
        slug: 'checkOverdue',
        label: '지연 마일스톤 점검',
        handler: checkOverdueHandler as any,
        outputSchema: [
          { name: 'checked', type: 'number' },
          { name: 'notified', type: 'number' },
        ],
      },
      {
        slug: 'checkExpiringDocs',
        label: '만료 임박 문서 점검',
        handler: checkExpiringDocsHandler as any,
        outputSchema: [
          { name: 'checked', type: 'number' },
          { name: 'notified', type: 'number' },
        ],
      },
    ],
  },

  queryPresets: {
    access: {
      create: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
      delete: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
      read: () => true,
      update: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
    },
    constraints: {
      read: [
        {
          label: '전체 공개',
          value: 'public',
          access: () => true,
        },
        {
          label: '관리자 전용',
          value: 'admin-only',
          access: ({ req }: any) => ['director', 'pm'].includes(req.user?.role),
        },
      ],
    },
  },

  secret: process.env.PAYLOAD_SECRET || 'CHANGE_ME_IN_PRODUCTION',
})
