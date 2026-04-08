import { describe, it, expect, vi, beforeEach } from 'vitest'

import { calculateProgress } from '../calculateProgress'

const createMockPayload = () => ({
  find: vi.fn(),
})

const buildArgs = (overrides: Record<string, any> = {}) => {
  const payload = createMockPayload()
  return {
    args: {
      doc: { id: 'proj-1', ...overrides.doc },
      req: { payload },
      collection: { slug: 'projects' },
      ...overrides,
    } as any,
    payload,
  }
}

describe('calculateProgress', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should calculate 100% when all milestones are done', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', status: 'done' },
        { id: 'm-2', status: 'done' },
        { id: 'm-3', status: 'done' },
      ],
    })

    const result = await calculateProgress(args)

    expect(result.progressPct).toBe(100)
  })

  it('should calculate 0% when no milestones are done', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', status: 'pending' },
        { id: 'm-2', status: 'active' },
        { id: 'm-3', status: 'blocked' },
      ],
    })

    const result = await calculateProgress(args)

    expect(result.progressPct).toBe(0)
  })

  it('should calculate partial progress correctly', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', status: 'done' },
        { id: 'm-2', status: 'done' },
        { id: 'm-3', status: 'pending' },
        { id: 'm-4', status: 'active' },
      ],
    })

    const result = await calculateProgress(args)

    // 2/4 = 50%
    expect(result.progressPct).toBe(50)
  })

  it('should round progress to nearest integer', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', status: 'done' },
        { id: 'm-2', status: 'pending' },
        { id: 'm-3', status: 'pending' },
      ],
    })

    const result = await calculateProgress(args)

    // 1/3 = 33.333... -> 33
    expect(result.progressPct).toBe(33)
  })

  it('should return 0% when project has no milestones', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await calculateProgress(args)

    expect(result.progressPct).toBe(0)
  })

  it('should query milestones with correct project filter', async () => {
    const { args, payload } = buildArgs({
      doc: { id: 'proj-42' },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await calculateProgress(args)

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'project-milestones',
      where: { project: { equals: 'proj-42' } },
      limit: 0,
      pagination: false,
    })
  })

  it('should only count done status, not skipped or other', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', status: 'done' },
        { id: 'm-2', status: 'skipped' },
        { id: 'm-3', status: 'blocked' },
        { id: 'm-4', status: 'active' },
        { id: 'm-5', status: 'pending' },
      ],
    })

    const result = await calculateProgress(args)

    // 1/5 = 20%
    expect(result.progressPct).toBe(20)
  })

  it('should set progressPct on the doc object', async () => {
    const { args, payload } = buildArgs({
      doc: { id: 'proj-1', name: '테스트 프로젝트' },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ id: 'm-1', status: 'done' }],
    })

    const result = await calculateProgress(args)

    expect(result.id).toBe('proj-1')
    expect(result.name).toBe('테스트 프로젝트')
    expect(result.progressPct).toBe(100)
  })

  it('should round 2/3 to 67%', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', status: 'done' },
        { id: 'm-2', status: 'done' },
        { id: 'm-3', status: 'pending' },
      ],
    })

    const result = await calculateProgress(args)

    // 2/3 = 66.666... -> 67
    expect(result.progressPct).toBe(67)
  })
})
