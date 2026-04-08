import { describe, it, expect, vi, beforeEach } from 'vitest'

import { checkMilestoneDeps } from '../checkMilestoneDeps'

const createMockPayload = () => ({
  find: vi.fn(),
})

const buildArgs = (overrides: Record<string, any> = {}) => {
  const payload = createMockPayload()
  return {
    args: {
      data: {
        status: 'done',
        name: '개발행위 허가',
        project: 'proj-1',
        seqOrder: 5,
        ...overrides.data,
      },
      originalDoc: {
        status: 'pending',
        project: 'proj-1',
        seqOrder: 5,
        ...overrides.originalDoc,
      },
      req: { payload },
      collection: { slug: 'project-milestones' },
      operation: overrides.operation ?? 'update',
      ...overrides,
    } as any,
    payload,
  }
}

describe('checkMilestoneDeps', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should check for incomplete preceding milestones when status changes to done', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({ docs: [] })

    await checkMilestoneDeps(args)

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'project-milestones',
        where: {
          and: [
            { project: { equals: 'proj-1' } },
            { seqOrder: { less_than: 5 } },
            { status: { not_in: ['done', 'skipped'] } },
          ],
        },
      }),
    )
  })

  it('should log warning when preceding milestones are incomplete', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({
      docs: [
        { id: 'm-1', name: '용지 매입', status: 'pending' },
        { id: 'm-2', name: '환경영향평가', status: 'active' },
      ],
    })

    await checkMilestoneDeps(args)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('미완료 선행 항목 2건'))
  })

  it('should not log warning when all preceding milestones are complete', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({ docs: [] })

    await checkMilestoneDeps(args)

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('should skip check when status is not changing to done', async () => {
    const { args, payload } = buildArgs({
      data: { status: 'active' },
    })

    const result = await checkMilestoneDeps(args)

    expect(payload.find).not.toHaveBeenCalled()
    expect(result).toEqual(args.data)
  })

  it('should skip check when status was already done', async () => {
    const { args, payload } = buildArgs({
      data: { status: 'done' },
      originalDoc: { status: 'done', project: 'proj-1', seqOrder: 5 },
    })

    const result = await checkMilestoneDeps(args)

    expect(payload.find).not.toHaveBeenCalled()
    expect(result).toEqual(args.data)
  })

  it('should use data.project and data.seqOrder when available', async () => {
    const { args, payload } = buildArgs({
      data: {
        status: 'done',
        project: 'proj-override',
        seqOrder: 10,
        name: '테스트',
      },
      originalDoc: {
        status: 'pending',
        project: 'proj-1',
        seqOrder: 5,
      },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await checkMilestoneDeps(args)

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([
            { project: { equals: 'proj-override' } },
            { seqOrder: { less_than: 10 } },
          ]),
        }),
      }),
    )
  })

  it('should fall back to originalDoc for project and seqOrder', async () => {
    const { args, payload } = buildArgs({
      data: {
        status: 'done',
        name: '테스트',
        // no project or seqOrder in data
      },
      originalDoc: {
        status: 'pending',
        project: 'proj-fallback',
        seqOrder: 7,
      },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await checkMilestoneDeps(args)

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([
            { project: { equals: 'proj-fallback' } },
            { seqOrder: { less_than: 7 } },
          ]),
        }),
      }),
    )
  })

  it('should return data unchanged', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await checkMilestoneDeps(args)

    expect(result).toEqual(args.data)
  })

  it('should handle missing originalDoc (create operation)', async () => {
    const { args, payload } = buildArgs({
      data: { status: 'done', project: 'proj-1', seqOrder: 1, name: '첫번째' },
      originalDoc: undefined,
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await checkMilestoneDeps(args)

    expect(result).toEqual(args.data)
  })
})
