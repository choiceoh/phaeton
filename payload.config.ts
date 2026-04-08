import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

import { Users } from './src/collections/Users'
import { Sites } from './src/collections/Sites'
import { Projects } from './src/collections/Projects'
import { MilestoneTemplates } from './src/collections/MilestoneTemplates'
import { ProjectMilestones } from './src/collections/ProjectMilestones'
import { Staff } from './src/collections/Staff'
import { StaffAssignments } from './src/collections/StaffAssignments'
import { ProjectDocuments } from './src/collections/ProjectDocuments'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— Phaeton',
    },
    dateFormat: 'yyyy-MM-dd',
  },

  i18n: {
    fallbackLanguage: 'ko',
  },

  collections: [
    Users,
    Sites,
    Projects,
    MilestoneTemplates,
    ProjectMilestones,
    Staff,
    StaffAssignments,
    ProjectDocuments,
  ],

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    migrationDir: path.resolve(dirname, 'migrations'),
  }),

  editor: lexicalEditor({}),

  cors: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'],

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  secret: process.env.PAYLOAD_SECRET || 'CHANGE_ME_IN_PRODUCTION',
})
