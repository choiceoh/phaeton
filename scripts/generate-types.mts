import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import type { CollectionConfig } from 'payload'

import { generateTypes } from '../node_modules/payload/dist/bin/generateTypes.js'

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: { useAsTitle: 'email' },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'viewer',
      options: [
        { label: '관리자', value: 'admin' },
        { label: '소장', value: 'director' },
        { label: '뷰어', value: 'viewer' },
      ],
    },
  ],
}

const filename = fileURLToPath(import.meta.url)
const dirname = path.resolve(path.dirname(filename), '..')

const config = await buildConfig({
  collections: [Users],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  editor: lexicalEditor({}),
  secret: process.env.PAYLOAD_SECRET || 'dev',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})

await generateTypes(config)
console.log('payload-types.ts generated')
process.exit(0)
