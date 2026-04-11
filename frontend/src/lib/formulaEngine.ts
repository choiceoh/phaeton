/**
 * Client-side formula engine for same-sheet formulas.
 *
 * Ported from backend/internal/formula/parser.go — same lexer + recursive
 * descent parser, but instead of generating SQL it builds an AST and evaluates
 * directly against row data.
 *
 * Cross-sheet functions (LOOKUP, SUMREL, etc.) are detected during parsing and
 * flagged so the caller can fall back to server-computed values.
 */

import type { Field } from '@/lib/types'

// ── Token types ──────────────────────────────────────────────────────────────

const enum TokenType {
  Number,
  String,
  Ident,
  Operator,
  Comma,
  LParen,
  RParen,
  Dot,
  Bang,
  EOF,
}

interface Token {
  type: TokenType
  value: string
}

// ── AST node types ───────────────────────────────────────────────────────────

export type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'fieldRef'; slug: string }
  | { type: 'binary'; op: string; left: ASTNode; right: ASTNode }
  | { type: 'unary'; op: '-' | '+'; operand: ASTNode }
  | { type: 'call'; fn: string; args: ASTNode[] }
  | { type: 'if'; cond: ASTNode; then: ASTNode; else: ASTNode }
  | { type: 'crossRef'; fn: string; args: string[] }

// ── Parse result ─────────────────────────────────────────────────────────────

export interface FormulaParseResult {
  ast: ASTNode
  refs: string[]
  hasCrossRefs: boolean
}

// ── Whitelisted functions ────────────────────────────────────────────────────

const ALLOWED_FUNCTIONS = new Set([
  'SUM', 'AVG', 'MIN', 'MAX', 'COUNT',
  'ROUND', 'CEIL', 'FLOOR', 'ABS',
  'COALESCE', 'NULLIF',
])

const CROSS_COLLECTION_FUNCTIONS = new Set([
  'LOOKUP', 'SUMREL', 'AVGREL', 'MINREL', 'MAXREL', 'COUNTREL',
])

// ── Lexer ────────────────────────────────────────────────────────────────────

function lex(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // Numbers
    if (isDigit(ch) || (ch === '.' && i + 1 < input.length && isDigit(input[i + 1]))) {
      const start = i
      while (i < input.length && (isDigit(input[i]) || input[i] === '.')) i++
      tokens.push({ type: TokenType.Number, value: input.slice(start, i) })
      continue
    }

    // Identifiers
    if (isLetter(ch) || ch === '_') {
      const start = i
      while (i < input.length && (isLetter(input[i]) || isDigit(input[i]) || input[i] === '_')) i++
      tokens.push({ type: TokenType.Ident, value: input.slice(start, i) })
      continue
    }

    // String literals (single-quoted)
    if (ch === "'") {
      i++
      const start = i
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\') i++
        i++
      }
      if (i >= input.length) throw new FormulaError('unterminated string literal')
      tokens.push({ type: TokenType.String, value: input.slice(start, i) })
      i++ // closing quote
      continue
    }

    // Two-character operators
    if (i + 1 < input.length) {
      const two = input.slice(i, i + 2)
      if (two === '<=' || two === '>=' || two === '!=' || two === '<>' || two === '||') {
        tokens.push({ type: TokenType.Operator, value: two })
        i += 2
        continue
      }
    }

    // Single-character operators and delimiters
    switch (ch) {
      case '+': case '-': case '*': case '/': case '%':
      case '<': case '>': case '=':
        tokens.push({ type: TokenType.Operator, value: ch })
        i++
        break
      case ',':
        tokens.push({ type: TokenType.Comma, value: ',' })
        i++
        break
      case '(':
        tokens.push({ type: TokenType.LParen, value: '(' })
        i++
        break
      case ')':
        tokens.push({ type: TokenType.RParen, value: ')' })
        i++
        break
      case '.':
        tokens.push({ type: TokenType.Dot, value: '.' })
        i++
        break
      case '!':
        tokens.push({ type: TokenType.Bang, value: '!' })
        i++
        break
      default:
        throw new FormulaError(`unexpected character '${ch}' at position ${i}`)
    }
  }

  tokens.push({ type: TokenType.EOF, value: '' })
  return tokens
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

// ── Error class ──────────────────────────────────────────────────────────────

export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaError'
  }
}

// ── Parser ───────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0
  private refs: string[] = []
  private hasCrossRefs = false

  constructor(
    private tokens: Token[],
    private slugs: Set<string>,
  ) {}

  parse(): FormulaParseResult {
    const ast = this.parseExpr()
    if (this.peek().type !== TokenType.EOF) {
      throw new FormulaError(`unexpected token "${this.peek().value}" after expression`)
    }
    return { ast, refs: this.refs, hasCrossRefs: this.hasCrossRefs }
  }

  private peek(): Token {
    return this.pos < this.tokens.length
      ? this.tokens[this.pos]
      : { type: TokenType.EOF, value: '' }
  }

  private advance(): Token {
    const t = this.peek()
    if (this.pos < this.tokens.length) this.pos++
    return t
  }

  private expect(type: TokenType): Token {
    const t = this.advance()
    if (t.type !== type) throw new FormulaError(`expected token type ${type}, got "${t.value}"`)
    return t
  }

  // comparison: lowest precedence
  private parseExpr(): ASTNode {
    let left = this.parseConcat()

    while (true) {
      const t = this.peek()
      if (t.type === TokenType.Operator &&
        (t.value === '<' || t.value === '>' || t.value === '<=' || t.value === '>=' ||
         t.value === '=' || t.value === '!=' || t.value === '<>')) {
        this.advance()
        const op = t.value === '!=' ? '<>' : t.value
        const right = this.parseConcat()
        left = { type: 'binary', op, left, right }
      } else {
        break
      }
    }
    return left
  }

  // string concatenation: ||
  private parseConcat(): ASTNode {
    let left = this.parseAddSub()

    while (true) {
      const t = this.peek()
      if (t.type === TokenType.Operator && t.value === '||') {
        this.advance()
        const right = this.parseAddSub()
        left = { type: 'binary', op: '||', left, right }
      } else {
        break
      }
    }
    return left
  }

  // addition / subtraction
  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv()

    while (true) {
      const t = this.peek()
      if (t.type === TokenType.Operator && (t.value === '+' || t.value === '-')) {
        this.advance()
        const right = this.parseMulDiv()
        left = { type: 'binary', op: t.value, left, right }
      } else {
        break
      }
    }
    return left
  }

  // multiplication / division / modulo
  private parseMulDiv(): ASTNode {
    let left = this.parseUnary()

    while (true) {
      const t = this.peek()
      if (t.type === TokenType.Operator && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.advance()
        const right = this.parseUnary()
        left = { type: 'binary', op: t.value, left, right }
      } else {
        break
      }
    }
    return left
  }

  // unary - / +
  private parseUnary(): ASTNode {
    const t = this.peek()
    if (t.type === TokenType.Operator && (t.value === '-' || t.value === '+')) {
      this.advance()
      const operand = this.parsePrimary()
      if (t.value === '-') return { type: 'unary', op: '-', operand }
      return operand
    }
    return this.parsePrimary()
  }

  // primary: literals, identifiers, function calls, parenthesized expressions
  private parsePrimary(): ASTNode {
    const t = this.peek()

    switch (t.type) {
      case TokenType.Number: {
        this.advance()
        const n = parseFloat(t.value)
        if (isNaN(n)) throw new FormulaError(`invalid number "${t.value}"`)
        return { type: 'number', value: n }
      }

      case TokenType.String: {
        this.advance()
        return { type: 'string', value: t.value.replace(/\\'/g, "'") }
      }

      case TokenType.Ident: {
        this.advance()
        const upper = t.value.toUpperCase()

        // Cross-sheet reference: SheetSlug!column
        if (this.peek().type === TokenType.Bang) {
          this.advance() // consume '!'
          const colTok = this.advance()
          if (colTok.type !== TokenType.Ident) {
            throw new FormulaError(`expected column name after ${t.value}!`)
          }
          this.hasCrossRefs = true
          return { type: 'crossRef', fn: 'SHEET_REF', args: [t.value, colTok.value] }
        }

        // IF → special handling
        if (upper === 'IF') return this.parseIF()

        // Cross-collection functions
        if (CROSS_COLLECTION_FUNCTIONS.has(upper)) {
          return this.parseCrossCollectionFunc(upper)
        }

        // Known function call
        if (ALLOWED_FUNCTIONS.has(upper)) {
          return this.parseFunctionCall(upper)
        }

        // Field slug reference
        if (!this.slugs.has(t.value)) {
          throw new FormulaError(`unknown field or function "${t.value}"`)
        }
        this.refs.push(t.value)
        return { type: 'fieldRef', slug: t.value }
      }

      case TokenType.LParen: {
        this.advance()
        const expr = this.parseExpr()
        this.expect(TokenType.RParen)
        return expr
      }

      default:
        throw new FormulaError(`unexpected token "${t.value}"`)
    }
  }

  private parseFunctionCall(name: string): ASTNode {
    this.expect(TokenType.LParen)
    const args: ASTNode[] = []
    if (this.peek().type !== TokenType.RParen) {
      while (true) {
        args.push(this.parseExpr())
        if (this.peek().type === TokenType.Comma) {
          this.advance()
        } else {
          break
        }
      }
    }
    this.expect(TokenType.RParen)
    return { type: 'call', fn: name, args }
  }

  private parseIF(): ASTNode {
    this.expect(TokenType.LParen)
    const cond = this.parseExpr()
    if (this.peek().type !== TokenType.Comma) {
      throw new FormulaError("expected ',' after IF condition")
    }
    this.advance()
    const thenExpr = this.parseExpr()
    if (this.peek().type !== TokenType.Comma) {
      throw new FormulaError("expected ',' after IF then-expression")
    }
    this.advance()
    const elseExpr = this.parseExpr()
    this.expect(TokenType.RParen)
    return { type: 'if', cond, then: thenExpr, else: elseExpr }
  }

  private parseCrossCollectionFunc(name: string): ASTNode {
    this.expect(TokenType.LParen)
    const relTok = this.advance()
    if (relTok.type !== TokenType.Ident) {
      throw new FormulaError(`${name}: first argument must be a relation field slug`)
    }
    if (this.peek().type !== TokenType.Comma) {
      throw new FormulaError(`expected ',' after relation field in ${name}`)
    }
    this.advance()
    const targetTok = this.advance()
    if (targetTok.type !== TokenType.Ident) {
      throw new FormulaError(`${name}: second argument must be a target field slug`)
    }
    this.expect(TokenType.RParen)

    this.hasCrossRefs = true
    return { type: 'crossRef', fn: name, args: [relTok.value, targetTok.value] }
  }
}

// ── Public parse function ────────────────────────────────────────────────────

export function parse(expression: string, validSlugs: Set<string>): FormulaParseResult {
  let expr = expression.trim()
  if (!expr) throw new FormulaError('empty expression')
  if (expr[0] === '=') expr = expr.slice(1)

  const tokens = lex(expr)
  const parser = new Parser(tokens, validSlugs)
  return parser.parse()
}

// ── Evaluator ────────────────────────────────────────────────────────────────

export function evaluate(ast: ASTNode, row: Record<string, unknown>): unknown {
  switch (ast.type) {
    case 'number':
      return ast.value

    case 'string':
      return ast.value

    case 'fieldRef': {
      const v = row[ast.slug]
      return v === undefined ? null : v
    }

    case 'unary': {
      const operand = evaluate(ast.operand, row)
      if (operand == null) return null
      const n = toNumber(operand)
      if (n == null) return null
      return ast.op === '-' ? -n : n
    }

    case 'binary':
      return evaluateBinary(ast.op, ast.left, ast.right, row)

    case 'call':
      return evaluateCall(ast.fn, ast.args, row)

    case 'if': {
      const cond = evaluate(ast.cond, row)
      if (cond == null) return null
      return cond ? evaluate(ast.then, row) : evaluate(ast.else, row)
    }

    case 'crossRef':
      // Cannot evaluate cross-sheet references client-side
      return null
  }
}

function evaluateBinary(
  op: string,
  leftNode: ASTNode,
  rightNode: ASTNode,
  row: Record<string, unknown>,
): unknown {
  const left = evaluate(leftNode, row)
  const right = evaluate(rightNode, row)

  // String concatenation
  if (op === '||') {
    if (left == null && right == null) return null
    return String(left ?? '') + String(right ?? '')
  }

  // Null propagation for all other operators
  if (left == null || right == null) return null

  // Comparison operators — work on numbers and strings
  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    return evaluateComparison(op, left, right)
  }

  // Arithmetic operators — require numbers
  const ln = toNumber(left)
  const rn = toNumber(right)
  if (ln == null || rn == null) return null

  switch (op) {
    case '+': return ln + rn
    case '-': return ln - rn
    case '*': return ln * rn
    case '/': return rn === 0 ? null : ln / rn
    case '%': return rn === 0 ? null : ln % rn
    default: return null
  }
}

function evaluateComparison(op: string, left: unknown, right: unknown): boolean {
  // Try numeric comparison first
  const ln = toNumber(left)
  const rn = toNumber(right)
  if (ln != null && rn != null) {
    switch (op) {
      case '=': return ln === rn
      case '<>': return ln !== rn
      case '<': return ln < rn
      case '>': return ln > rn
      case '<=': return ln <= rn
      case '>=': return ln >= rn
    }
  }

  // Fall back to string comparison
  const ls = String(left)
  const rs = String(right)
  switch (op) {
    case '=': return ls === rs
    case '<>': return ls !== rs
    case '<': return ls < rs
    case '>': return ls > rs
    case '<=': return ls <= rs
    case '>=': return ls >= rs
    default: return false
  }
}

function evaluateCall(fn: string, argNodes: ASTNode[], row: Record<string, unknown>): unknown {
  const args = argNodes.map((a) => evaluate(a, row))

  switch (fn) {
    case 'SUM': {
      let sum = 0
      for (const a of args) {
        if (a == null) continue
        const n = toNumber(a)
        if (n != null) sum += n
      }
      return sum
    }

    case 'AVG': {
      let sum = 0, count = 0
      for (const a of args) {
        if (a == null) continue
        const n = toNumber(a)
        if (n != null) { sum += n; count++ }
      }
      return count === 0 ? null : sum / count
    }

    case 'MIN': {
      let min: number | null = null
      for (const a of args) {
        if (a == null) continue
        const n = toNumber(a)
        if (n != null && (min == null || n < min)) min = n
      }
      return min
    }

    case 'MAX': {
      let max: number | null = null
      for (const a of args) {
        if (a == null) continue
        const n = toNumber(a)
        if (n != null && (max == null || n > max)) max = n
      }
      return max
    }

    case 'COUNT': {
      let count = 0
      for (const a of args) {
        if (a != null) count++
      }
      return count
    }

    case 'ROUND': {
      if (args[0] == null) return null
      const n = toNumber(args[0])
      if (n == null) return null
      const precision = args.length > 1 && args[1] != null ? toNumber(args[1]) ?? 0 : 0
      const factor = Math.pow(10, precision)
      return Math.round(n * factor) / factor
    }

    case 'CEIL': {
      if (args[0] == null) return null
      const n = toNumber(args[0])
      return n == null ? null : Math.ceil(n)
    }

    case 'FLOOR': {
      if (args[0] == null) return null
      const n = toNumber(args[0])
      return n == null ? null : Math.floor(n)
    }

    case 'ABS': {
      if (args[0] == null) return null
      const n = toNumber(args[0])
      return n == null ? null : Math.abs(n)
    }

    case 'COALESCE': {
      for (const a of args) {
        if (a != null) return a
      }
      return null
    }

    case 'NULLIF': {
      if (args.length < 2) return args[0] ?? null
      const a = args[0]
      const b = args[1]
      if (a == null && b == null) return null
      // If equal, return null
      if (a === b) return null
      const an = toNumber(a)
      const bn = toNumber(b)
      if (an != null && bn != null && an === bn) return null
      return a
    }

    default:
      return null
  }
}

/** Coerce a value to a number. Returns null for non-numeric values. */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return isNaN(v) ? null : v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    if (v === '') return null
    const n = Number(v)
    return isNaN(n) ? null : n
  }
  return null
}

// ── Dependency graph ─────────────────────────────────────────────────────────

export interface DependencyGraph {
  /** changedSlug → formula field slugs that depend on it */
  graph: Map<string, string[]>
  /** Topologically sorted formula field slugs (evaluate in this order) */
  evalOrder: string[]
  /** Parsed formula ASTs keyed by field slug */
  parsedFormulas: Map<string, { ast: ASTNode; hasCrossRefs: boolean; refs: string[] }>
}

export function buildDependencyGraph(fields: Field[]): DependencyGraph {
  // Build set of valid slugs (non-layout, non-computed fields + formula fields themselves)
  const slugs = new Set<string>()
  const formulaFields: Field[] = []

  for (const f of fields) {
    if (f.is_layout) continue
    if (f.field_type === 'formula') {
      formulaFields.push(f)
      slugs.add(f.slug) // formulas can reference other formulas
    } else if (f.field_type !== 'lookup' && f.field_type !== 'rollup') {
      slugs.add(f.slug)
    }
  }

  // Parse all formula expressions
  const parsedFormulas = new Map<string, { ast: ASTNode; hasCrossRefs: boolean; refs: string[] }>()
  for (const f of formulaFields) {
    const expression = (f.options as Record<string, unknown> | undefined)?.expression
    if (typeof expression !== 'string' || !expression) continue
    try {
      const result = parse(expression, slugs)
      parsedFormulas.set(f.slug, {
        ast: result.ast,
        hasCrossRefs: result.hasCrossRefs,
        refs: result.refs,
      })
    } catch {
      // Skip unparseable formulas
    }
  }

  // Build reverse dependency map: changedSlug → [formulaSlugs]
  const graph = new Map<string, string[]>()
  for (const [slug, info] of parsedFormulas) {
    for (const ref of info.refs) {
      const list = graph.get(ref) ?? []
      list.push(slug)
      graph.set(ref, list)
    }
  }

  // Topological sort of formula fields
  const evalOrder = topologicalSort(parsedFormulas)

  return { graph, evalOrder, parsedFormulas }
}

/** Topological sort of formula fields. Formulas that depend on other formulas
 * are evaluated after their dependencies. Cycles are detected and those
 * formulas are excluded. */
function topologicalSort(
  formulas: Map<string, { ast: ASTNode; hasCrossRefs: boolean; refs: string[] }>,
): string[] {
  const result: string[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const cycled = new Set<string>()

  function visit(slug: string): boolean {
    if (visited.has(slug)) return true
    if (visiting.has(slug)) {
      // Cycle detected
      cycled.add(slug)
      return false
    }

    visiting.add(slug)
    const info = formulas.get(slug)
    if (info) {
      for (const ref of info.refs) {
        // Only visit if ref is also a formula field
        if (formulas.has(ref)) {
          if (!visit(ref)) {
            cycled.add(slug)
          }
        }
      }
    }
    visiting.delete(slug)
    visited.add(slug)
    if (!cycled.has(slug)) {
      result.push(slug)
    }
    return true
  }

  for (const slug of formulas.keys()) {
    visit(slug)
  }

  return result
}

// ── Row recomputation ────────────────────────────────────────────────────────

/**
 * Recompute all locally-evaluable formula fields for a single row.
 * Returns a partial record of formula slug → recomputed value.
 * Only formulas without cross-refs are evaluated.
 */
export function recomputeFormulas(
  row: Record<string, unknown>,
  depGraph: DependencyGraph,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {}
  // Build a working copy that includes overrides as we go
  const working = { ...row }

  for (const slug of depGraph.evalOrder) {
    const info = depGraph.parsedFormulas.get(slug)
    if (!info || info.hasCrossRefs) continue
    const value = evaluate(info.ast, working)
    overrides[slug] = value
    working[slug] = value // feed into subsequent formulas
  }

  return overrides
}

/**
 * Get the formula field slugs that are affected (directly or transitively)
 * by a change to the given field slug.
 */
export function getAffectedFormulas(
  changedSlug: string,
  depGraph: DependencyGraph,
): string[] {
  const affected = new Set<string>()
  const queue = [changedSlug]

  while (queue.length > 0) {
    const slug = queue.pop()!
    const dependents = depGraph.graph.get(slug)
    if (!dependents) continue
    for (const dep of dependents) {
      if (!affected.has(dep)) {
        affected.add(dep)
        queue.push(dep) // transitive deps
      }
    }
  }

  // Return in eval order
  return depGraph.evalOrder.filter((s) => affected.has(s))
}
