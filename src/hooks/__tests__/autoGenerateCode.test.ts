import { describe, it, expect, vi, beforeEach } from 'vitest'

import { autoGenerateCode } from '../autoGenerateCode'

const createMockPayload = () => ({
  find: vi.fn(),
})

const buildArgs = (overrides: Record<string, any> = {}) => {
  const payload = createMockPayload()
  return {
    args: {
      data: {
        type: 'solar',
        ...overrides.data,
      },
      operation: overrides.operation ?? 'create',
      req: { payload },
      collection: { slug: 'projects' },
      ...overrides,
    } as any,
    payload,
  }
}

describe('autoGenerateCode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09'))
  })

  it('should generate SL-2026-001 for first solar project', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'solar' },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await autoGenerateCode(args)

    expect(result.code).toBe('SL-2026-001')
  })

  it('should generate RT-2026-001 for first rooftop project', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'rooftop' },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await autoGenerateCode(args)

    expect(result.code).toBe('RT-2026-001')
  })

  it('should generate ES-2026-001 for first ESS project', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'ess' },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await autoGenerateCode(args)

    expect(result.code).toBe('ES-2026-001')
  })

  it('should generate HB-2026-001 for first hybrid project', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'hybrid' },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await autoGenerateCode(args)

    expect(result.code).toBe('HB-2026-001')
  })

  it('should increment code number based on last existing code', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'solar' },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ code: 'SL-2026-015' }],
    })

    const result = await autoGenerateCode(args)

    expect(result.code).toBe('SL-2026-016')
  })

  it('should pad code number to 3 digits', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'rooftop' },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ code: 'RT-2026-005' }],
    })

    const result = await autoGenerateCode(args)

    expect(result.code).toBe('RT-2026-006')
  })

  it('should skip when operation is not create', async () => {
    const { args, payload } = buildArgs({
      operation: 'update',
      data: { type: 'solar' },
    })

    const result = await autoGenerateCode(args)

    expect(result).toEqual(args.data)
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('should skip when data already has a code', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'solar', code: 'CUSTOM-001' },
    })

    const result = await autoGenerateCode(args)

    expect(result).toEqual(args.data)
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('should skip when data is null', async () => {
    const { args, payload } = buildArgs()
    args.data = null

    const result = await autoGenerateCode(args)

    expect(result).toBeNull()
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('should skip when type has no known prefix', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'unknown' },
    })

    const result = await autoGenerateCode(args)

    expect(result).toEqual(args.data)
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('should query for existing codes with correct pattern', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'ess' },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await autoGenerateCode(args)

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'projects',
      where: { code: { like: 'ES-2026-' } },
      sort: '-code',
      limit: 1,
    })
  })

  it('should use current year from system time', async () => {
    vi.setSystemTime(new Date('2030-01-15'))
    const { args, payload } = buildArgs({
      data: { type: 'solar' },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await autoGenerateCode(args)

    expect(result.code).toBe('SL-2030-001')
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: { like: 'SL-2030-' } },
      }),
    )
  })

  it('should preserve existing data fields when adding code', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'solar', name: '태양광 1호', capacity: 3.0 },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    const result = await autoGenerateCode(args)

    expect(result.name).toBe('태양광 1호')
    expect(result.capacity).toBe(3.0)
    expect(result.type).toBe('solar')
    expect(result.code).toBe('SL-2026-001')
  })

  it('should handle high sequence numbers', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'solar' },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ code: 'SL-2026-999' }],
    })

    const result = await autoGenerateCode(args)

    expect(result.code).toBe('SL-2026-1000')
  })

  it('should handle NaN in last code gracefully', async () => {
    const { args, payload } = buildArgs({
      data: { type: 'solar' },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ code: 'SL-2026-abc' }],
    })

    const result = await autoGenerateCode(args)

    // parseInt('abc', 10) returns NaN, isNaN check keeps nextNum = 1
    expect(result.code).toBe('SL-2026-001')
  })
})
