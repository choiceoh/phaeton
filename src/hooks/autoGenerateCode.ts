import type { CollectionBeforeValidateHook } from 'payload'

const TYPE_PREFIX: Record<string, string> = {
  solar: 'SL',
  rooftop: 'RT',
  ess: 'ES',
  hybrid: 'HB',
}

export const autoGenerateCode: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req: { payload },
}) => {
  if (operation !== 'create' || !data || data.code) return data

  const type = data.type as string
  const prefix = TYPE_PREFIX[type]
  if (!prefix) return data

  const year = new Date().getFullYear()
  const pattern = `${prefix}-${year}-`

  const existing = await payload.find({
    collection: 'projects',
    where: { code: { like: pattern } },
    sort: '-code',
    limit: 1,
  })

  let nextNum = 1
  if (existing.docs.length > 0) {
    const lastCode = (existing.docs[0] as any).code as string
    const lastNum = parseInt(lastCode.split('-')[2], 10)
    if (!isNaN(lastNum)) nextNum = lastNum + 1
  }

  return {
    ...data,
    code: `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`,
  }
}
