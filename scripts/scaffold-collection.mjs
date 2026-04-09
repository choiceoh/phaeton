#!/usr/bin/env node

import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const name = process.argv[2]
if (!name) {
  console.log('Usage: npm run scaffold <CollectionName>')
  console.log('Example: npm run scaffold PaymentMilestones')
  process.exit(1)
}

if (!/^[A-Z][a-zA-Z]+$/.test(name)) {
  console.error('Error: Collection name must be PascalCase (e.g. PaymentMilestones)')
  process.exit(1)
}

const slug = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
const collectionDir = join(process.cwd(), 'src/collections')
const collectionFile = join(collectionDir, `${name}.ts`)

if (existsSync(collectionFile)) {
  console.error(`Error: ${collectionFile} already exists`)
  process.exit(1)
}

const content = `import type { CollectionConfig } from 'payload'

export const ${name}: CollectionConfig = {
  slug: '${slug}',
  admin: { useAsTitle: 'name' },
  labels: { singular: '${name}', plural: '${name} 목록' },
  fields: [
    { name: 'name', type: 'text', required: true, label: '이름' },
    // TODO: add fields
  ],
  access: {
    read: () => true,
    create: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
    update: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
    delete: ({ req }) => req.user?.role === 'director',
  },
}
`

writeFileSync(collectionFile, content)
console.log(`Created: src/collections/${name}.ts (slug: ${slug})`)
console.log()
console.log('Next steps:')
console.log(`  1. payload.config.ts — import { ${name} } from './collections/${name}.ts'`)
console.log(`     collections: [..., ${name}]`)
console.log()
console.log('  2. npm run generate:types')
