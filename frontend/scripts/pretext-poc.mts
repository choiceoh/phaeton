/**
 * Pretext POC — Node-side text layout measurement for AI-driven UI coding.
 *
 * Goal: verify that `@chenglou/pretext` can run in Node (via `@napi-rs/canvas`)
 * with the actual app fonts (Geist Variable + Noto Sans KR) and produce
 * sensible line-count / height / width numbers for real UI strings.
 *
 * If this POC is convincing, the next step is a Vitest-level "text fit" check
 * that catches overflow bugs Claude can't see from source alone.
 *
 * Run:  cd frontend && npx tsx scripts/pretext-poc.mts
 */

import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// --- 1. Polyfill OffscreenCanvas before importing pretext --------------------
//
// Pretext's measurement module (dist/measurement.js) does:
//   if (typeof OffscreenCanvas !== 'undefined')
//     measureContext = new OffscreenCanvas(1, 1).getContext('2d')
//   else if (typeof document !== 'undefined') ...
//   else throw
//
// We make `globalThis.OffscreenCanvas` resolve to a napi-canvas-backed shim.
// The only method pretext calls on the returned context is `measureText()`
// (and it sets `.font`), so we don't need a full OffscreenCanvas impl.
class NodeOffscreenCanvas {
  private canvas: ReturnType<typeof createCanvas>
  constructor(width: number, height: number) {
    this.canvas = createCanvas(Math.max(1, width), Math.max(1, height))
  }
  getContext(type: '2d') {
    if (type !== '2d') throw new Error(`Only 2d supported, got ${type}`)
    return this.canvas.getContext('2d')
  }
  get width() {
    return this.canvas.width
  }
  get height() {
    return this.canvas.height
  }
}
;(globalThis as unknown as { OffscreenCanvas: typeof NodeOffscreenCanvas }).OffscreenCanvas =
  NodeOffscreenCanvas

// --- 2. Register fonts --------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')

function registerGeist() {
  // Variable-weight Latin subset. This is the same file the browser loads via
  // `@import "@fontsource-variable/geist"` in src/index.css.
  const geistPath = resolve(
    frontendRoot,
    'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  )
  const key = GlobalFonts.registerFromPath(geistPath, 'Geist Variable')
  if (!key) throw new Error(`Failed to register Geist: ${geistPath}`)
}

function registerNotoSansKR() {
  // Fontsource ships Noto Sans KR as ~100 subsets × 9 weights. We register the
  // whole directory once (Skia picks the right subset per glyph at measure time).
  const notoDir = resolve(frontendRoot, 'node_modules/@fontsource/noto-sans-kr/files')
  const loaded = GlobalFonts.loadFontsFromDir(notoDir)
  if (loaded === 0) throw new Error(`Failed to load Noto Sans KR from ${notoDir}`)
  return loaded
}

registerGeist()
const notoLoaded = registerNotoSansKR()

// --- 3. Import pretext AFTER polyfill + font registration --------------------
const { prepare, prepareWithSegments, layout, measureLineStats, layoutWithLines } =
  await import('@chenglou/pretext')

// --- 4. Test cases ------------------------------------------------------------
//
// NOTE on font stacks: napi-canvas (Skia) applies font fallback only when the
// first family covers the glyph. Geist has NO hangul, so "Geist, Noto Sans KR"
// does NOT fall back to Noto — Geist substitutes `.notdef` placeholder boxes
// (~8.4px each) and Korean width is severely underestimated. The working
// direction is CJK-first: "Noto Sans KR, Geist Variable". In that order,
// Korean measures via Noto and Latin falls back to Geist correctly.
// This is a Node-measurement convention — the browser CSS stack is separate.
interface Sample {
  label: string
  text: string
  font: string // CSS font shorthand: "<weight>? <size>px <family>"
  lineHeight: number
  containerWidths: number[]
}

const SAMPLES: Sample[] = [
  {
    label: 'EN short button',
    text: 'Save',
    font: '500 14px "Geist Variable"',
    lineHeight: 20,
    containerWidths: [40, 60, 80, 120],
  },
  {
    label: 'EN medium button',
    text: 'Add Custom Field',
    font: '500 14px "Geist Variable"',
    lineHeight: 20,
    containerWidths: [80, 120, 160, 240],
  },
  {
    label: 'EN long description',
    text: 'This is a long description that should wrap to multiple lines in a narrow container',
    font: '400 13px "Geist Variable"',
    lineHeight: 18,
    containerWidths: [120, 200, 320, 480],
  },
  {
    label: 'KR short button',
    text: '저장',
    font: '500 14px "Noto Sans KR", "Geist Variable"',
    lineHeight: 20,
    containerWidths: [40, 60, 80, 120],
  },
  {
    label: 'KR medium button',
    text: '프로젝트 상세 보기',
    font: '500 14px "Noto Sans KR", "Geist Variable"',
    lineHeight: 20,
    containerWidths: [60, 80, 100, 120, 160, 240],
  },
  {
    label: 'KR long card title',
    text: '2024년 4분기 태양광 발전사업 인허가 및 공사 일정 관리',
    font: '500 15px "Noto Sans KR", "Geist Variable"',
    lineHeight: 22,
    containerWidths: [160, 240, 320, 480],
  },
  {
    label: 'KR mixed long (with parens)',
    text: '프로젝트 A-1 (태양광 3MW, 2024-03 착공)',
    font: '500 14px "Noto Sans KR", "Geist Variable"',
    lineHeight: 20,
    containerWidths: [120, 160, 200, 280],
  },
]

// --- 5. Run and print ---------------------------------------------------------
console.log(`[setup] Noto Sans KR subset files loaded: ${notoLoaded}`)
console.log(
  `[setup] Registered families: ${GlobalFonts.families
    .map((f) => f.family)
    .filter((f) => /geist|noto/i.test(f))
    .join(', ')}\n`,
)

for (const sample of SAMPLES) {
  console.log(`━━━ ${sample.label}`)
  console.log(`    text : ${JSON.stringify(sample.text)}`)
  console.log(`    font : ${sample.font}`)

  // Use case 1: quick line count / height
  const prepared = prepare(sample.text, sample.font)
  const preparedSeg = prepareWithSegments(sample.text, sample.font)

  for (const width of sample.containerWidths) {
    const { lineCount, height } = layout(prepared, width, sample.lineHeight)
    const { maxLineWidth } = measureLineStats(preparedSeg, width)
    const overflow = maxLineWidth > width + 0.5
    const fits = lineCount === 1 && !overflow
    const marker = fits ? 'fit' : lineCount > 1 ? 'wrap' : 'over'
    console.log(
      `    w=${width.toString().padStart(4)} → lines=${lineCount}  h=${height
        .toFixed(1)
        .padStart(5)}  widest=${maxLineWidth.toFixed(1).padStart(6)}  [${marker}]`,
    )
  }

  // Show the actual wrapped lines at the tightest width
  const tightest = sample.containerWidths[0]
  const { lines } = layoutWithLines(preparedSeg, tightest, sample.lineHeight)
  if (lines.length > 1) {
    console.log(`    at w=${tightest}, lines:`)
    lines.forEach((l, i) =>
      console.log(`      ${i + 1}. ${JSON.stringify(l.text)}  (${l.width.toFixed(1)}px)`),
    )
  }
  console.log()
}

console.log('[done]')
