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
    push: true,
  }),

  editor: lexicalEditor({}),

  cors: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'],

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  secret: process.env.PAYLOAD_SECRET || 'CHANGE_ME_IN_PRODUCTION',
})
