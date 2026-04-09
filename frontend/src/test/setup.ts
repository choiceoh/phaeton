// Global test setup. Vitest runs this before any test file via setupFiles.
//
// Responsibilities:
//  1. Extend expect with @testing-library/jest-dom matchers (toBeInTheDocument, ...)
//  2. Start the MSW server before any test runs
//  3. Reset MSW handlers between tests so per-test overrides don't leak
//  4. Tear down MSW after all tests

import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './mocks/server'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
