import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { searchPlugin } from '@payloadcms/plugin-search'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig } from 'payload'

import { DashboardConfigs } from './src/collections/DashboardConfigs.ts'
import { MilestoneTemplates } from './src/collections/MilestoneTemplates.ts'
import { Pages } from './src/collections/Pages.ts'
import { ProjectDocuments } from './src/collections/ProjectDocuments.ts'
import { ProjectMilestones } from './src/collections/ProjectMilestones.ts'
import { Projects } from './src/collections/Projects.ts'
import { Staff } from './src/collections/Staff.ts'
import { StaffAssignments } from './src/collections/StaffAssignments.ts'
import { Users } from './src/collections/Users.ts'
import { SiteSettings } from './src/globals/SiteSettings.ts'
import { checkExpiringDocsHandler } from './src/jobs/checkExpiringDocs.ts'
import { checkOverdueHandler } from './src/jobs/checkOverdue.ts'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  onInit: async (payload) => {
    const shouldSeed = process.env.NODE_ENV !== 'production' || process.env.SEED_DATA === 'true'
    if (!shouldSeed) return

    const users = await payload.find({ collection: 'users', limit: 0 })
    if (users.totalDocs === 0) {
      const { seed } = await import('./seed/index')
      await seed(payload)
    }
  },

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
        if (collectionConfig?.slug === 'pages') return `${base}/p/${data.slug}`
        return `${base}/dashboard`
      },
      collections: ['projects', 'pages'],
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
    DashboardConfigs,
    Pages,
  ],

  globals: [SiteSettings],

  plugins: [
    searchPlugin({
      collections: ['projects', 'project-documents'],
      defaultPriorities: {
        projects: 10,
        'project-documents': 5,
      },
      searchOverrides: {
        labels: { singular: '검색 결과', plural: '검색 결과' },
      },
    }),

    nestedDocsPlugin({
      collections: ['milestone-templates'],
      generateLabel: (_, doc) => (doc as any).name,
      generateURL: (docs) => docs.reduce((url, doc) => `${url}/${(doc as any).slug || doc.id}`, ''),
    }),

    formBuilderPlugin({
      fields: {
        text: true,
        textarea: true,
        select: true,
        number: true,
        checkbox: true,
        date: true,
        email: false,
        state: false,
        country: false,
        message: false,
        payment: false,
      },
      formOverrides: {
        labels: { singular: '양식', plural: '양식 목록' },
        admin: { group: '도구' },
      },
      formSubmissionOverrides: {
        labels: { singular: '양식 제출', plural: '양식 제출 목록' },
        admin: { group: '도구' },
      },
    }),

    ...(process.env.S3_BUCKET
      ? [
          s3Storage({
            collections: {
              'project-documents': {
                prefix: 'documents/',
              },
            },
            bucket: process.env.S3_BUCKET,
            config: {
              region: process.env.S3_REGION || 'ap-northeast-2',
              credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY || '',
                secretAccessKey: process.env.S3_SECRET_KEY || '',
              },
            },
          }),
        ]
      : []),
  ],

  email: nodemailerAdapter({
    defaultFromAddress: process.env.SMTP_FROM || 'noreply@phaeton.local',
    defaultFromName: 'Phaeton',
    transportOptions: {
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 587,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    },
  }),

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
