import { describe, it, expect } from 'vitest'
import {
  parse,
  evaluate,
  buildDependencyGraph,
  recomputeFormulas,
  getAffectedFormulas,
} from './formulaEngine'
import type { Field } from './types'

// ── Helpers ──────────────────────────────────────────────────────────────────

const slugs = new Set(['price', 'quantity', 'discount', 'name', 'status', 'amount', 'tax', 'total', 'is_active'])

function ev(expr: string, row: Record<string, unknown> = {}, customSlugs?: Set<string>) {
  const result = parse(expr, customSlugs ?? slugs)
  return evaluate(result.ast, row)
}

function makeField(overrides: Partial<Field>): Field {
  return {
    id: 'f1',
    collection_id: 'c1',
    slug: 'test',
    label: 'Test',
    field_type: 'text',
    is_required: false,
    is_unique: false,
    is_indexed: false,
    width: 3,
    height: 1,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// ── Lexer / Parser tests ─────────────────────────────────────────────────────

describe('parse', () => {
  it('strips leading = (Excel convention)', () => {
    const result = parse('=price * 2', slugs)
    expect(result.ast.type).toBe('binary')
  })

  it('throws on empty expression', () => {
    expect(() => parse('', slugs)).toThrow('empty expression')
    expect(() => parse('  ', slugs)).toThrow('empty expression')
  })

  it('throws on unknown field', () => {
    expect(() => parse('unknown_field + 1', slugs)).toThrow('unknown field or function')
  })

  it('throws on unterminated string', () => {
    expect(() => parse("'hello", slugs)).toThrow('unterminated string')
  })

  it('collects field refs', () => {
    const result = parse('price * quantity', slugs)
    expect(result.refs).toContain('price')
    expect(result.refs).toContain('quantity')
    expect(result.hasCrossRefs).toBe(false)
  })

  it('detects cross-refs', () => {
    const s = new Set(['customer', 'amount'])
    const result = parse('LOOKUP(customer, amount)', s)
    expect(result.hasCrossRefs).toBe(true)
  })

  it('detects sheet references', () => {
    const s = new Set(['price'])
    // SheetSlug!column syntax — should set hasCrossRefs
    const result = parse('OtherSheet!some_col', s)
    expect(result.hasCrossRefs).toBe(true)
  })

  it('throws on unexpected token after expression', () => {
    expect(() => parse('price quantity', slugs)).toThrow('unexpected token')
  })
})

// ── Arithmetic evaluation ────────────────────────────────────────────────────

describe('evaluate — arithmetic', () => {
  it('simple multiplication', () => {
    expect(ev('price * quantity', { price: 100, quantity: 5 })).toBe(500)
  })

  it('addition and subtraction', () => {
    expect(ev('price + quantity - discount', { price: 100, quantity: 50, discount: 10 })).toBe(140)
  })

  it('operator precedence: * before +', () => {
    expect(ev('price + quantity * discount', { price: 10, quantity: 5, discount: 2 })).toBe(20)
  })

  it('parentheses override precedence', () => {
    const s = new Set(['a', 'b', 'c'])
    const result = parse('(a + b) * c', s)
    expect(evaluate(result.ast, { a: 10, b: 5, c: 2 })).toBe(30)
  })

  it('modulo', () => {
    expect(ev('price % quantity', { price: 10, quantity: 3 })).toBe(1)
  })

  it('division by zero returns null', () => {
    expect(ev('price / quantity', { price: 10, quantity: 0 })).toBeNull()
  })

  it('modulo by zero returns null', () => {
    expect(ev('price % quantity', { price: 10, quantity: 0 })).toBeNull()
  })

  it('unary negation', () => {
    expect(ev('-price', { price: 42 })).toBe(-42)
  })

  it('unary plus (no-op)', () => {
    expect(ev('+price', { price: 42 })).toBe(42)
  })

  it('numeric literals', () => {
    const s = new Set(['price'])
    expect(ev('price * 1.1', { price: 100 }, s)).toBeCloseTo(110)
  })
})

// ── Null propagation ─────────────────────────────────────────────────────────

describe('evaluate — null propagation', () => {
  it('null field yields null for arithmetic', () => {
    expect(ev('price * quantity', { price: null, quantity: 5 })).toBeNull()
    expect(ev('price + quantity', { price: 10 })).toBeNull() // quantity undefined → null
  })

  it('null in unary returns null', () => {
    expect(ev('-price', { price: null })).toBeNull()
  })

  it('null in comparison returns null', () => {
    expect(ev('price > quantity', { price: null, quantity: 5 })).toBeNull()
  })
})

// ── Comparisons ──────────────────────────────────────────────────────────────

describe('evaluate — comparisons', () => {
  it('equality', () => {
    expect(ev('price = quantity', { price: 10, quantity: 10 })).toBe(true)
    expect(ev('price = quantity', { price: 10, quantity: 20 })).toBe(false)
  })

  it('not-equal (<>)', () => {
    expect(ev('price != quantity', { price: 10, quantity: 20 })).toBe(true)
  })

  it('less than / greater than', () => {
    expect(ev('price < quantity', { price: 5, quantity: 10 })).toBe(true)
    expect(ev('price > quantity', { price: 10, quantity: 5 })).toBe(true)
  })

  it('less-equal / greater-equal', () => {
    expect(ev('price <= quantity', { price: 10, quantity: 10 })).toBe(true)
    expect(ev('price >= quantity', { price: 10, quantity: 10 })).toBe(true)
  })

  it('string comparison', () => {
    expect(ev('name = status', { name: 'hello', status: 'hello' })).toBe(true)
    expect(ev('name = status', { name: 'abc', status: 'def' })).toBe(false)
  })
})

// ── String concatenation ─────────────────────────────────────────────────────

describe('evaluate — string concatenation', () => {
  it('basic concat', () => {
    expect(ev("name || ' ' || status", { name: 'Hello', status: 'World' })).toBe('Hello World')
  })

  it('concat with null treats null as empty string', () => {
    expect(ev("name || status", { name: 'Hello', status: null })).toBe('Hello')
  })

  it('both null returns null', () => {
    expect(ev('name || status', { name: null, status: null })).toBeNull()
  })
})

// ── IF function ──────────────────────────────────────────────────────────────

describe('evaluate — IF', () => {
  it('IF true branch', () => {
    expect(ev('IF(quantity > 100, price * 0.9, price)', { quantity: 150, price: 100 })).toBeCloseTo(90)
  })

  it('IF false branch', () => {
    expect(ev('IF(quantity > 100, price * 0.9, price)', { quantity: 50, price: 100 })).toBe(100)
  })

  it('IF with null condition returns null', () => {
    expect(ev('IF(quantity > 100, price, discount)', { quantity: null, price: 10, discount: 5 })).toBeNull()
  })

  it('nested IF', () => {
    expect(ev(
      'IF(price > 100, IF(quantity > 10, discount, amount), tax)',
      { price: 200, quantity: 20, discount: 15, amount: 5, tax: 3 },
    )).toBe(15)
  })
})

// ── Built-in functions ───────────────────────────────────────────────────────

describe('evaluate — functions', () => {
  it('ROUND', () => {
    expect(ev('ROUND(price, 2)', { price: 3.14159 })).toBeCloseTo(3.14)
  })

  it('ROUND with no precision', () => {
    expect(ev('ROUND(price)', { price: 3.7 })).toBe(4)
  })

  it('CEIL', () => {
    expect(ev('CEIL(price)', { price: 3.2 })).toBe(4)
  })

  it('FLOOR', () => {
    expect(ev('FLOOR(price)', { price: 3.9 })).toBe(3)
  })

  it('ABS', () => {
    expect(ev('ABS(price)', { price: -42 })).toBe(42)
    expect(ev('ABS(price)', { price: 42 })).toBe(42)
  })

  it('COALESCE returns first non-null', () => {
    expect(ev('COALESCE(price, quantity, discount)', { price: null, quantity: null, discount: 10 })).toBe(10)
  })

  it('COALESCE all null returns null', () => {
    expect(ev('COALESCE(price, quantity)', { price: null, quantity: null })).toBeNull()
  })

  it('NULLIF returns null when equal', () => {
    expect(ev('NULLIF(price, quantity)', { price: 10, quantity: 10 })).toBeNull()
  })

  it('NULLIF returns first when not equal', () => {
    expect(ev('NULLIF(price, quantity)', { price: 10, quantity: 20 })).toBe(10)
  })

  it('SUM', () => {
    expect(ev('SUM(price, quantity, discount)', { price: 10, quantity: 20, discount: 30 })).toBe(60)
  })

  it('SUM with nulls', () => {
    expect(ev('SUM(price, quantity)', { price: 10, quantity: null })).toBe(10)
  })

  it('AVG', () => {
    expect(ev('AVG(price, quantity)', { price: 10, quantity: 20 })).toBe(15)
  })

  it('AVG all null returns null', () => {
    expect(ev('AVG(price, quantity)', { price: null, quantity: null })).toBeNull()
  })

  it('MIN', () => {
    expect(ev('MIN(price, quantity, discount)', { price: 30, quantity: 10, discount: 20 })).toBe(10)
  })

  it('MAX', () => {
    expect(ev('MAX(price, quantity, discount)', { price: 30, quantity: 10, discount: 20 })).toBe(30)
  })

  it('COUNT', () => {
    expect(ev('COUNT(price, quantity, discount)', { price: 10, quantity: null, discount: 30 })).toBe(2)
  })

  it('null argument to ROUND/CEIL/FLOOR/ABS returns null', () => {
    expect(ev('ROUND(price)', { price: null })).toBeNull()
    expect(ev('CEIL(price)', { price: null })).toBeNull()
    expect(ev('FLOOR(price)', { price: null })).toBeNull()
    expect(ev('ABS(price)', { price: null })).toBeNull()
  })
})

// ── Type coercion ────────────────────────────────────────────────────────────

describe('evaluate — type coercion', () => {
  it('string to number', () => {
    expect(ev('price + quantity', { price: '10', quantity: 20 })).toBe(30)
  })

  it('boolean to number', () => {
    expect(ev('price + is_active', { price: 10, is_active: true })).toBe(11)
  })

  it('non-numeric string yields null', () => {
    expect(ev('price + name', { price: 10, name: 'hello' })).toBeNull()
  })
})

// ── String literals ──────────────────────────────────────────────────────────

describe('evaluate — string literals', () => {
  it('string literal in comparison', () => {
    expect(ev("status = 'active'", { status: 'active' })).toBe(true)
    expect(ev("status = 'inactive'", { status: 'active' })).toBe(false)
  })

  it('IF with string literal', () => {
    expect(ev("IF(status = 'active', price, 0)", { status: 'active', price: 100 })).toBe(100)
    expect(ev("IF(status = 'active', price, 0)", { status: 'inactive', price: 100 })).toBe(0)
  })
})

// ── Cross-ref detection ──────────────────────────────────────────────────────

describe('cross-ref detection', () => {
  it('LOOKUP sets hasCrossRefs', () => {
    const s = new Set(['customer'])
    const result = parse('LOOKUP(customer, name)', s)
    expect(result.hasCrossRefs).toBe(true)
    expect(result.ast.type).toBe('crossRef')
  })

  it('SUMREL sets hasCrossRefs', () => {
    const s = new Set(['order'])
    const result = parse('SUMREL(order, amount)', s)
    expect(result.hasCrossRefs).toBe(true)
  })

  it('mixed expression with cross-ref', () => {
    const s = new Set(['customer', 'price'])
    const result = parse('price + LOOKUP(customer, amount)', s)
    expect(result.hasCrossRefs).toBe(true)
  })

  it('crossRef node evaluates to null', () => {
    const s = new Set(['customer'])
    const result = parse('LOOKUP(customer, name)', s)
    expect(evaluate(result.ast, { customer: 'c1' })).toBeNull()
  })
})

// ── Dependency graph ─────────────────────────────────────────────────────────

describe('buildDependencyGraph', () => {
  it('builds correct dependencies', () => {
    const fields: Field[] = [
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({ slug: 'quantity', field_type: 'number' }),
      makeField({
        slug: 'total',
        field_type: 'formula',
        options: { expression: 'price * quantity', result_type: 'number' },
      }),
    ]
    const dep = buildDependencyGraph(fields)

    expect(dep.graph.get('price')).toContain('total')
    expect(dep.graph.get('quantity')).toContain('total')
    expect(dep.evalOrder).toContain('total')
    expect(dep.parsedFormulas.has('total')).toBe(true)
  })

  it('handles chained formulas in correct order', () => {
    const fields: Field[] = [
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({ slug: 'quantity', field_type: 'number' }),
      makeField({
        slug: 'subtotal',
        field_type: 'formula',
        options: { expression: 'price * quantity', result_type: 'number' },
      }),
      makeField({
        slug: 'tax',
        field_type: 'formula',
        options: { expression: 'subtotal * 0.1', result_type: 'number' },
      }),
      makeField({
        slug: 'total',
        field_type: 'formula',
        options: { expression: 'subtotal + tax', result_type: 'number' },
      }),
    ]
    const dep = buildDependencyGraph(fields)

    const subtotalIdx = dep.evalOrder.indexOf('subtotal')
    const taxIdx = dep.evalOrder.indexOf('tax')
    const totalIdx = dep.evalOrder.indexOf('total')

    // subtotal must be before tax and total
    expect(subtotalIdx).toBeLessThan(taxIdx)
    expect(subtotalIdx).toBeLessThan(totalIdx)
    // tax must be before total
    expect(taxIdx).toBeLessThan(totalIdx)
  })

  it('excludes cross-ref formulas from local evaluation', () => {
    const fields: Field[] = [
      makeField({ slug: 'customer', field_type: 'relation' }),
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({
        slug: 'customer_name',
        field_type: 'formula',
        options: { expression: 'LOOKUP(customer, name)', result_type: 'text' },
      }),
    ]
    const dep = buildDependencyGraph(fields)
    const info = dep.parsedFormulas.get('customer_name')
    expect(info?.hasCrossRefs).toBe(true)
  })

  it('skips unparseable formulas', () => {
    const fields: Field[] = [
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({
        slug: 'broken',
        field_type: 'formula',
        options: { expression: '???invalid', result_type: 'number' },
      }),
    ]
    const dep = buildDependencyGraph(fields)
    expect(dep.parsedFormulas.has('broken')).toBe(false)
  })
})

// ── Row recomputation ────────────────────────────────────────────────────────

describe('recomputeFormulas', () => {
  it('recomputes simple formula', () => {
    const fields: Field[] = [
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({ slug: 'quantity', field_type: 'number' }),
      makeField({
        slug: 'total',
        field_type: 'formula',
        options: { expression: 'price * quantity', result_type: 'number' },
      }),
    ]
    const dep = buildDependencyGraph(fields)
    const overrides = recomputeFormulas({ price: 100, quantity: 5, total: 0 }, dep)
    expect(overrides.total).toBe(500)
  })

  it('recomputes chained formulas', () => {
    const fields: Field[] = [
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({ slug: 'quantity', field_type: 'number' }),
      makeField({
        slug: 'subtotal',
        field_type: 'formula',
        options: { expression: 'price * quantity', result_type: 'number' },
      }),
      makeField({
        slug: 'tax',
        field_type: 'formula',
        options: { expression: 'subtotal * 0.1', result_type: 'number' },
      }),
      makeField({
        slug: 'total',
        field_type: 'formula',
        options: { expression: 'subtotal + tax', result_type: 'number' },
      }),
    ]
    const dep = buildDependencyGraph(fields)
    const overrides = recomputeFormulas({ price: 100, quantity: 5 }, dep)

    expect(overrides.subtotal).toBe(500)
    expect(overrides.tax).toBeCloseTo(50)
    expect(overrides.total).toBeCloseTo(550)
  })

  it('skips cross-ref formulas', () => {
    const fields: Field[] = [
      makeField({ slug: 'customer', field_type: 'relation' }),
      makeField({
        slug: 'customer_name',
        field_type: 'formula',
        options: { expression: 'LOOKUP(customer, name)', result_type: 'text' },
      }),
    ]
    const dep = buildDependencyGraph(fields)
    const overrides = recomputeFormulas({ customer: 'c1', customer_name: 'Server Value' }, dep)
    expect(overrides).not.toHaveProperty('customer_name')
  })
})

// ── getAffectedFormulas ──────────────────────────────────────────────────────

describe('getAffectedFormulas', () => {
  it('returns direct dependents', () => {
    const fields: Field[] = [
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({ slug: 'quantity', field_type: 'number' }),
      makeField({
        slug: 'total',
        field_type: 'formula',
        options: { expression: 'price * quantity', result_type: 'number' },
      }),
    ]
    const dep = buildDependencyGraph(fields)
    expect(getAffectedFormulas('price', dep)).toContain('total')
  })

  it('returns transitive dependents', () => {
    const fields: Field[] = [
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({ slug: 'quantity', field_type: 'number' }),
      makeField({
        slug: 'subtotal',
        field_type: 'formula',
        options: { expression: 'price * quantity', result_type: 'number' },
      }),
      makeField({
        slug: 'total',
        field_type: 'formula',
        options: { expression: 'subtotal + 10', result_type: 'number' },
      }),
    ]
    const dep = buildDependencyGraph(fields)
    const affected = getAffectedFormulas('price', dep)
    expect(affected).toContain('subtotal')
    expect(affected).toContain('total')
  })

  it('returns empty for unrelated fields', () => {
    const fields: Field[] = [
      makeField({ slug: 'price', field_type: 'number' }),
      makeField({ slug: 'quantity', field_type: 'number' }),
      makeField({ slug: 'name', field_type: 'text' }),
      makeField({
        slug: 'total',
        field_type: 'formula',
        options: { expression: 'price * quantity', result_type: 'number' },
      }),
    ]
    const dep = buildDependencyGraph(fields)
    expect(getAffectedFormulas('name', dep)).toHaveLength(0)
  })
})

// ── Complex expressions (matching Go parser_test.go cases) ───────────────────

describe('evaluate — complex expressions', () => {
  it('price * quantity (Go test case)', () => {
    expect(ev('price * quantity', { price: 100, quantity: 3 })).toBe(300)
  })

  it('ROUND(price * 1.1, 2)', () => {
    expect(ev('ROUND(price * 1.1, 2)', { price: 100 })).toBeCloseTo(110)
  })

  it('IF(quantity > 100, price * 0.9, price)', () => {
    expect(ev('IF(quantity > 100, price * 0.9, price)', { quantity: 150, price: 100 })).toBeCloseTo(90)
    expect(ev('IF(quantity > 100, price * 0.9, price)', { quantity: 50, price: 100 })).toBe(100)
  })

  it('COALESCE(discount, 0) * price', () => {
    expect(ev('COALESCE(discount, 0) * price', { discount: null, price: 100 })).toBe(0)
    expect(ev('COALESCE(discount, 0) * price', { discount: 0.1, price: 100 })).toBeCloseTo(10)
  })

  it('complex nested: price * (1 - COALESCE(discount, 0))', () => {
    expect(ev('price * (1 - COALESCE(discount, 0))', { price: 100, discount: 0.2 })).toBeCloseTo(80)
    expect(ev('price * (1 - COALESCE(discount, 0))', { price: 100, discount: null })).toBe(100)
  })
})
