import { setupServer } from 'msw/node'

import { handlers } from './handlers'

// Single MSW server instance shared across all tests. Lifecycle is managed
// in src/test/setup.ts (listen → resetHandlers → close).
export const server = setupServer(...handlers)
