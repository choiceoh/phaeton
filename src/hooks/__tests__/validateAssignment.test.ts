import { describe, it, expect, vi, beforeEach } from 'vitest'

import { validateAssignment } from '../validateAssignment'

const createMockPayload = () => ({
  find: vi.fn(),
})

const buildArgs = (overrides: Record<string, any> = {}) => {
  const payload = createMockPayload()
  return {
    args: {
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 50,
        ...overrides.data,
      },
      originalDoc: overrides.originalDoc ?? null,
      operation: overrides.operation ?? 'create',
      req: { payload },
      collection: { slug: 'staff-assignments' },
      ...overrides,
    } as any,
    payload,
  }
}

describe('validateAssignment', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should allow assignment when total is under 100%', async () => {
    const { args, payload } = buildArgs({
      data: { staff: 'staff-1', startDate: '2026-01-01', endDate: '2026-06-30', allocationPct: 50 },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ id: 'a-1', allocationPct: 30 }],
    })

    const result = await validateAssignment(args)

    expect(result).toEqual(args.data)
  })

  it('should warn when total is over 100% but under 200%', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { args, payload } = buildArgs({
      data: { staff: 'staff-1', startDate: '2026-01-01', endDate: '2026-06-30', allocationPct: 80 },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ id: 'a-1', allocationPct: 70 }],
    })

    const result = await validateAssignment(args)

    expect(result).toEqual(args.data)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('총 할당률 150%'))
  })

  it('should throw error when total exceeds 200%', async () => {
    const { args, payload } = buildArgs({
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 100,
      },
    })
    payload.find.mockResolvedValueOnce({
      docs: [
        { id: 'a-1', allocationPct: 80 },
        { id: 'a-2', allocationPct: 30 },
      ],
    })

    await expect(validateAssignment(args)).rejects.toThrow('할당률 초과')
  })

  it('should throw error with correct numbers in message', async () => {
    const { args, payload } = buildArgs({
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 100,
      },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ id: 'a-1', allocationPct: 120 }],
    })

    await expect(validateAssignment(args)).rejects.toThrow('기존 120% + 신규 100%')
  })

  it('should skip validation when staffId is missing', async () => {
    const { args, payload } = buildArgs({
      data: { staff: null, startDate: '2026-01-01', allocationPct: 100 },
    })

    const result = await validateAssignment(args)

    expect(result).toEqual(args.data)
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('should skip validation when startDate is missing', async () => {
    const { args, payload } = buildArgs({
      data: { staff: 'staff-1', startDate: undefined, allocationPct: 100 },
    })

    const result = await validateAssignment(args)

    expect(result).toEqual(args.data)
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('should handle staff as object with id property', async () => {
    const { args, payload } = buildArgs({
      data: {
        staff: { id: 'staff-obj-1', name: '홍길동' },
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 50,
      },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await validateAssignment(args)

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([{ staff: { equals: 'staff-obj-1' } }]),
        }),
      }),
    )
  })

  it('should exclude self on update operation', async () => {
    const { args, payload } = buildArgs({
      operation: 'update',
      originalDoc: { id: 'existing-1' },
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 50,
      },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await validateAssignment(args)

    const whereArg = payload.find.mock.calls[0][0].where
    expect(whereArg.and).toEqual(expect.arrayContaining([{ id: { not_equals: 'existing-1' } }]))
  })

  it('should not add self-exclusion filter on create operation', async () => {
    const { args, payload } = buildArgs({
      operation: 'create',
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 50,
      },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await validateAssignment(args)

    const whereArg = payload.find.mock.calls[0][0].where
    const hasNotEquals = whereArg.and.some((cond: any) => cond.id?.not_equals)
    expect(hasNotEquals).toBe(false)
  })

  it('should default allocationPct to 100 when not provided', async () => {
    const { args, payload } = buildArgs({
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: undefined,
      },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ id: 'a-1', allocationPct: 110 }],
    })

    // 110 existing + 100 default = 210 > 200 -> should throw
    await expect(validateAssignment(args)).rejects.toThrow('할당률 초과')
  })

  it('should use 9999-12-31 as fallback endDate for open-ended assignments', async () => {
    const { args, payload } = buildArgs({
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: undefined,
        allocationPct: 50,
      },
    })
    payload.find.mockResolvedValueOnce({ docs: [] })

    await validateAssignment(args)

    const whereArg = payload.find.mock.calls[0][0].where
    expect(whereArg.and).toEqual(
      expect.arrayContaining([{ startDate: { less_than: '9999-12-31' } }]),
    )
  })

  it('should allow exactly 200% total', async () => {
    const { args, payload } = buildArgs({
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 100,
      },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ id: 'a-1', allocationPct: 100 }],
    })

    // 100 + 100 = 200, should not throw
    const result = await validateAssignment(args)
    expect(result).toEqual(args.data)
  })

  it('should throw at 201% total', async () => {
    const { args, payload } = buildArgs({
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 101,
      },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ id: 'a-1', allocationPct: 100 }],
    })

    await expect(validateAssignment(args)).rejects.toThrow('할당률 초과')
  })

  it('should default existing doc allocationPct to 100 when undefined', async () => {
    const { args, payload } = buildArgs({
      data: {
        staff: 'staff-1',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        allocationPct: 50,
      },
    })
    payload.find.mockResolvedValueOnce({
      docs: [{ id: 'a-1', allocationPct: undefined }],
    })

    // existing defaults to 100, new is 50 -> 150% -> warn but allow
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await validateAssignment(args)

    expect(result).toEqual(args.data)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('총 할당률 150%'))
  })
})
