import { vi } from 'vitest'

// --- ID sequence ---

let idSeq = 100

export const resetFactories = () => {
  idSeq = 100
}

const nextId = () => ++idSeq

// --- Mock Payload ---

export const createMockPayload = () => ({
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  db: { drizzle: { execute: vi.fn() } },
})

// --- Data Builders ---

export const buildUser = (overrides: Record<string, unknown> = {}) => ({
  id: nextId(),
  name: '홍길동',
  role: 'pm' as const,
  department: 'renewable',
  email: `user-${idSeq}@phaeton.local`,
  phone: '010-0000-0000',
  ...overrides,
})

export const buildProject = (overrides: Record<string, unknown> = {}) => {
  const id = nextId()
  return {
    id,
    name: '테스트 태양광',
    code: `SL-2026-${String(id).padStart(3, '0')}`,
    type: 'solar' as const,
    status: 'gen-permit',
    department: 'renewable',
    assignedPM: 1,
    capacityKw: 3000,
    codTarget: '2027-06-30',
    ...overrides,
  }
}

export const buildMilestone = (overrides: Record<string, unknown> = {}) => ({
  id: nextId(),
  name: '발전사업허가 신청',
  project: 1,
  seqOrder: 1,
  status: 'pending' as const,
  plannedDate: '2026-05-01',
  dueDate: '2026-05-15',
  ...overrides,
})

export const buildStaff = (overrides: Record<string, unknown> = {}) => ({
  id: nextId(),
  name: '김철수',
  role: 'PM',
  phone: '010-1111-1111',
  email: `staff-${idSeq}@phaeton.local`,
  isActive: true,
  ...overrides,
})

export const buildAssignment = (overrides: Record<string, unknown> = {}) => ({
  id: nextId(),
  staff: 1,
  project: 1,
  roleOnProject: 'PM',
  startDate: '2026-04-01',
  allocationPct: 100,
  ...overrides,
})

// --- Hook Test Helpers ---

export const buildHookArgs = (collection: string, overrides: Record<string, any> = {}) => {
  const payload = createMockPayload()
  return {
    args: {
      data: overrides.data ?? {},
      operation: overrides.operation ?? 'create',
      req: { payload, user: overrides.user ?? buildUser() },
      collection: { slug: collection },
      ...overrides,
    } as any,
    payload,
  }
}
