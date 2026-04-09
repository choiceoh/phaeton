#!/usr/bin/env node

import { watch } from 'node:fs'
import { execSync } from 'node:child_process'

const WATCH_DIR = 'src/collections'
const DEBOUNCE_MS = 1000

let timeout

console.log(`[types] Watching ${WATCH_DIR}/ for changes...`)

watch(WATCH_DIR, { recursive: true }, (_event, filename) => {
  if (!filename?.endsWith('.ts')) return
  clearTimeout(timeout)
  timeout = setTimeout(() => {
    console.log(`[types] ${filename} changed — regenerating...`)
    try {
      execSync('npx payload generate:types', { stdio: 'inherit' })
    } catch {
      // generation errors are logged by payload
    }
  }, DEBOUNCE_MS)
})

process.on('SIGINT', () => process.exit(0))
