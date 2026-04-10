import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement ResizeObserver — provide a no-op stub so components
// that observe element size changes (e.g. DataTable) don't crash in tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
