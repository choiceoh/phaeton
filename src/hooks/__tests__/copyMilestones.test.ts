import { describe, it, expect, vi, beforeEach } from 'vitest'

import { copyMilestones } from '../copyMilestones'

const createMockPayload = () => ({
  find: vi.fn(),
  create: vi.fn(),
})

const buildArgs = (overrides: Record<string, any> = {}) => {
  const payload = createMockPayload()
  return {
    args: {
      doc: { id: 'proj-1', type: 'solar', ...overrides.doc },
      operation: overrides.operation ?? 'create',
      req: { payload },
      collection: { slug: 'projects' },
      ...overrides,
    } as any,
    payload,
  }
}

describe('copyMilestones', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should skip non-create operations', async () => {
    const { args, payload } = buildArgs({ operation: 'update' })
    const result = await copyMilestones(args)
    expect(result).toEqual(args.doc)
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('should copy solar templates for solar project', async () => {
    const templates = [
      { id: 'tmpl-1', name: '용지 매입', seqOrder: 1 },
      { id: 'tmpl-2', name: '개발행위 허가', seqOrder: 2 },
    ]
    const { args, payload } = buildArgs({
      doc: { id: 'proj-1', type: 'solar' },
    })
    payload.find.mockResolvedValueOnce({ docs: templates })

    await copyMilestones(args)

    expect(payload.find).toHaveBeenCalledTimes(1)
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'milestone-templates',
        where: { projectType: { equals: 'solar' } },
        sort: 'seqOrder',
        limit: 100,
      }),
    )
    expect(payload.create).toHaveBeenCalledTimes(2)
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'project-milestones',
        data: expect.objectContaining({
          project: 'proj-1',
          template: 'tmpl-1',
          name: '용지 매입',
          seqOrder: 1,
          status: 'pending',
        }),
      }),
    )
  })

  it('should copy rooftop templates for rooftop project', async () => {
    const templates = [{ id: 'tmpl-r1', name: '건축물 구조검토', seqOrder: 1 }]
    const { args, payload } = buildArgs({
      doc: { id: 'proj-2', type: 'rooftop' },
    })
    payload.find.mockResolvedValueOnce({ docs: templates })

    await copyMilestones(args)

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectType: { equals: 'rooftop' } },
      }),
    )
    expect(payload.create).toHaveBeenCalledTimes(1)
  })

  it('should copy ess templates for ess project', async () => {
    const templates = [{ id: 'tmpl-e1', name: 'PCS 설치', seqOrder: 1 }]
    const { args, payload } = buildArgs({
      doc: { id: 'proj-3', type: 'ess' },
    })
    payload.find.mockResolvedValueOnce({ docs: templates })

    await copyMilestones(args)

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectType: { equals: 'ess' } },
      }),
    )
    expect(payload.create).toHaveBeenCalledTimes(1)
  })

  it('should copy solar + ESS extras for hybrid project', async () => {
    const solarTemplates = [{ id: 'tmpl-s1', name: '용지 매입', seqOrder: 1 }]
    const essExtras = [
      { id: 'tmpl-e1', name: '소방시설 심의', seqOrder: 10 },
      { id: 'tmpl-e2', name: '배터리·PCS 발주', seqOrder: 20 },
    ]
    const { args, payload } = buildArgs({
      doc: { id: 'proj-4', type: 'hybrid' },
    })

    // First call: solar templates
    payload.find.mockResolvedValueOnce({ docs: solarTemplates })
    // Second call: ESS extras
    payload.find.mockResolvedValueOnce({ docs: essExtras })

    await copyMilestones(args)

    expect(payload.find).toHaveBeenCalledTimes(2)
    // Verify solar templates fetched with type 'solar' (not 'hybrid')
    expect(payload.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { projectType: { equals: 'solar' } },
      }),
    )
    // Verify ESS extras query
    expect(payload.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'milestone-templates',
        where: {
          and: [
            { projectType: { equals: 'ess' } },
            { name: { in: ['소방시설 심의', '배터리·PCS 발주', '전력거래소 등록'] } },
          ],
        },
      }),
    )
    // 1 solar + 2 ESS extras = 3 creates
    expect(payload.create).toHaveBeenCalledTimes(3)
    // ESS extras should have seqOrder = 100 + tmpl.seqOrder
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          seqOrder: 110,
          name: '소방시설 심의',
        }),
      }),
    )
  })

  it('should handle no templates found', async () => {
    const { args, payload } = buildArgs({
      doc: { id: 'proj-5', type: 'solar' },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await copyMilestones(args)

    expect(result).toEqual(args.doc)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('should handle hybrid with no ESS extras', async () => {
    const solarTemplates = [{ id: 'tmpl-s1', name: '용지 매입', seqOrder: 1 }]
    const { args, payload } = buildArgs({
      doc: { id: 'proj-6', type: 'hybrid' },
    })
    payload.find.mockResolvedValueOnce({ docs: solarTemplates })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await copyMilestones(args)

    // Only solar template creates, no ESS extras
    expect(payload.create).toHaveBeenCalledTimes(1)
  })

  it('should always return doc', async () => {
    const { args, payload } = buildArgs()
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await copyMilestones(args)

    expect(result).toEqual(args.doc)
  })
})
