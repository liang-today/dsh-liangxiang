/**
 * Server-side rendering of the 走势 chart to a standalone SVG string.
 *
 * This is the "give me a URL" side of the feature: the Host answers
 * `/liangxiang/api/bars.svg` with bytes, so a page can embed the chart without
 * running our client, and the same geometry the panel uses is reused here — one
 * layout, two renderers.
 *
 * Hard constraints, because these bytes land in other people's pages:
 * - no `<script>`, no `<foreignObject>`, no external references, no fonts
 * - every text node escaped; no user-authored text is passed through
 * - deterministic: same input, same bytes (cache keys hash the output)
 * - no pointer-only information: each candle carries a native `<title>`
 *
 * Visual contract: three horizontal guides with right-hand percentages, a 50%
 * 梁位 baseline, vermilion rises and cool-grey falls, a dashed current-value marker
 * with a value pill, and hatched 未统计 bands for unobserved stretches.
 */
import type { BarsGeometry } from './bars.ts'

export interface BarsSvgPalette {
  background: string
  text: string
  textMuted: string
  grid: string
  frame: string
  up: string
  down: string
  gap: string
  gapText: string
  baseline: string
  pill: string
  pillText: string
}

export const BARS_SVG_PALETTES: Record<'light' | 'dark', BarsSvgPalette> = {
  light: {
    background: 'transparent',
    text: '#3c3730',
    textMuted: '#8a8271',
    grid: 'rgba(60,55,48,0.10)',
    frame: 'rgba(60,55,48,0.18)',
    up: '#c95f38',
    down: '#74839f',
    gap: 'rgba(138,130,113,0.16)',
    gapText: '#8a8271',
    baseline: 'rgba(60,55,48,0.30)',
    pill: 'rgba(60,55,48,0.90)',
    pillText: '#fffdf9',
  },
  dark: {
    background: 'transparent',
    text: '#e6e1d6',
    textMuted: '#9aa3b2',
    grid: 'rgba(230,225,214,0.10)',
    frame: 'rgba(230,225,214,0.16)',
    up: '#c95f38',
    down: '#74839f',
    gap: 'rgba(154,163,178,0.14)',
    gapText: '#9aa3b2',
    baseline: 'rgba(230,225,214,0.30)',
    pill: 'rgba(230,225,214,0.92)',
    pillText: '#171a20',
  },
}

export interface BarsSvgInput {
  geometry: BarsGeometry
  width: number
  height: number
  theme: 'light' | 'dark'
  title: string
  subtitle: string
  footer: string | null
  emptyText: string
  gapLabel: string
  formatTime: (t: number) => string
  formatRatio: (value: number) => string
}

const FONT_STACK = "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
const GUTTER_RIGHT = 52

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Render one window of candles as a self-contained SVG document.
 * @param input - geometry plus the already-formatted copy the Host owns.
 * @returns an SVG string with no scripts and no external references.
 */
export function renderBarsSvg(input: BarsSvgInput): string {
  const { geometry, width, height, theme } = input
  const palette = BARS_SVG_PALETTES[theme]
  const { plot, columns } = geometry
  const parts: string[] = []
  const label = escapeXml(input.title)
  const ratioOf = input.formatRatio
  const plotRight = plot.left + plot.width
  const yOf = (value: number): number => plot.top + ((geometry.domain.high - value) / (geometry.domain.high - geometry.domain.low)) * plot.height

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}" role="img" aria-label="${label}">`)
  parts.push(`<title>${label}</title>`)
  parts.push(`<desc>${escapeXml(input.subtitle)}</desc>`)
  parts.push(`<rect width="100%" height="100%" fill="${palette.background}" rx="10"/>`)

  if (columns.length === 0) {
    parts.push(`<text x="${round(width / 2)}" y="${round(height / 2 - 4)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="12" fill="${palette.textMuted}">${escapeXml(input.emptyText)}</text>`)
    parts.push(`<text x="${round(width / 2)}" y="${round(height / 2 + 14)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="10" fill="${palette.gapText}">${escapeXml(input.subtitle)}</text>`)
    parts.push('</svg>')
    return parts.join('')
  }

  // Guides: top / middle / bottom of the visible domain, labelled on the right.
  const hasValue = columns.some(column => column.candle.close !== null && !column.candle.gap)
  const guides = hasValue ? [geometry.domain.high, (geometry.domain.high + geometry.domain.low) / 2, geometry.domain.low] : []
  for (const value of guides) {
    const y = round(yOf(value))
    parts.push(`<line x1="${round(plot.left)}" y1="${y}" x2="${round(plotRight)}" y2="${y}" stroke="${palette.grid}" stroke-width="1"/>`)
    parts.push(`<text x="${round(plotRight + 6)}" y="${y + 3}" font-family="${FONT_STACK}" font-size="9" fill="${palette.textMuted}" font-variant-numeric="tabular-nums">${escapeXml(ratioOf(value))}</text>`)
  }

  // The 50% line turns "which side of the case is winning" into something you
  // can read without doing arithmetic.
  if (hasValue && geometry.domain.low < 0.5 && geometry.domain.high > 0.5) {
    const y = round(yOf(0.5))
    parts.push(`<line x1="${round(plot.left)}" y1="${y}" x2="${round(plotRight)}" y2="${y}" stroke="${palette.baseline}" stroke-width="1" stroke-dasharray="4 4"/>`)
    parts.push(`<text x="${round(plot.left + 3)}" y="${y - 3}" font-family="${FONT_STACK}" font-size="8" fill="${palette.gapText}">50%</text>`)
  }

  // Unobserved stretches first, so candles always paint on top.
  const gapRuns: { from: number; to: number; width: number }[] = []
  for (const column of columns) {
    if (!column.candle.gap) continue
    const last = gapRuns.at(-1)
    if (last !== undefined && round(last.from + last.width) >= round(column.x) - 0.5) {
      last.to = column.x + column.width
      last.width = last.to - last.from
    } else {
      gapRuns.push({ from: column.x, to: column.x + column.width, width: column.width })
    }
  }
  for (const run of gapRuns) {
    const runWidth = Math.max(1, run.width)
    const runBottom = plot.top + plot.height
    parts.push(`<rect x="${round(run.from)}" y="${round(plot.top)}" width="${round(runWidth)}" height="${round(plot.height)}" fill="${palette.gap}"/>`)
    // Hatching separates "we were not looking" from "the line was flat here".
    for (let x = run.from + 4; x < run.from + runWidth; x += 7) {
      parts.push(`<line x1="${round(x)}" y1="${round(runBottom)}" x2="${round(x + 10)}" y2="${round(runBottom - 10)}" stroke="${palette.gapText}" stroke-width="0.7" opacity="0.5"/>`)
    }
    for (const x of [run.from, run.from + runWidth]) {
      parts.push(`<line x1="${round(x)}" y1="${round(plot.top)}" x2="${round(x)}" y2="${round(runBottom)}" stroke="${palette.gapText}" stroke-width="1" stroke-dasharray="3 3" opacity="0.85"/>`)
    }
    if (runWidth >= 30) {
      parts.push(`<text x="${round(run.from + runWidth / 2)}" y="${round(plot.top + 10)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="8" fill="${palette.gapText}">${escapeXml(input.gapLabel)}</text>`)
    }
  }

  // Candles. A hairline of wick still shows the high/low of a quiet bucket.
  for (const column of columns) {
    const { candle } = column
    if (candle.gap || candle.close === null) continue
    const open = candle.open ?? candle.close
    const rising = candle.close >= open
    const color = rising ? palette.up : palette.down
    const bodyWidth = Math.max(1.5, round(Math.min(11, column.width * 0.62)))
    const cx = round(column.x + column.width / 2)
    const yHigh = round(yOf(candle.high ?? candle.close))
    const yLow = round(yOf(candle.low ?? candle.close))
    parts.push(`<g><title>${escapeXml(`${input.formatTime(candle.t)} ${ratioOf(candle.close)}`)}</title>`)
    if (yLow - yHigh > 0.5) {
      parts.push(`<line x1="${cx}" y1="${yHigh}" x2="${cx}" y2="${yLow}" stroke="${color}" stroke-width="1"/>`)
    }
    const yOpen = yOf(open)
    const yClose = yOf(candle.close)
    parts.push(`<rect x="${round(cx - bodyWidth / 2)}" y="${round(Math.min(yOpen, yClose))}" width="${bodyWidth}" height="${round(Math.max(1, Math.abs(yClose - yOpen)))}" rx="0.5" fill="${color}" fill-opacity="0.9" stroke="${color}" stroke-width="0.5" data-candle="1" data-t="${candle.t}" data-close="${ratioOf(candle.close)}" data-up="${candle.upVotes}" data-down="${candle.downVotes}" data-samples="${candle.samples}"/>`)
    parts.push('</g>')
  }

  // Close path: a thin guide that makes long stretches readable at a glance.
  for (const segment of geometry.segments) {
    if (segment.points.length < 2) continue
    const points = segment.points.map(point => `${round(point.x)},${round(point.y)}`).join(' ')
    parts.push(`<polyline points="${points}" fill="none" stroke="${palette.baseline}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>`)
  }

  // Current value: dashed rule, end dot and a pill in the right gutter.
  const latest = columns.at(-1)
  const lastValued = latest !== undefined && !latest.candle.gap ? latest : undefined
  if (lastValued !== undefined && lastValued.candle.close !== null) {
    const value = lastValued.candle.close
    const y = round(yOf(value))
    const text = ratioOf(value)
    parts.push(`<line x1="${round(plot.left)}" y1="${y}" x2="${round(plotRight)}" y2="${y}" stroke="${palette.gapText}" stroke-width="1" stroke-dasharray="2 4" opacity="0.75"/>`)
    parts.push(`<circle cx="${round(lastValued.x + lastValued.width / 2)}" cy="${y}" r="2.2" fill="${palette.baseline}"/>`)
    const pillWidth = 4 + text.length * 5.2 + 4
    parts.push(`<rect x="${round(plotRight + 2)}" y="${round(y - 8)}" width="${round(pillWidth)}" height="16" rx="4" fill="${palette.pill}"/>`)
    parts.push(`<text x="${round(plotRight + 4)}" y="${round(y + 3.5)}" font-family="${FONT_STACK}" font-size="9" font-weight="600" fill="${palette.pillText}" font-variant-numeric="tabular-nums">${escapeXml(text)}</text>`)
  }

  parts.push(`<rect x="${round(plot.left)}" y="${round(plot.top)}" width="${round(plot.width)}" height="${round(plot.height)}" fill="none" stroke="${palette.frame}" stroke-width="1" rx="2"/>`)
  if (!hasValue && columns.some(column => column.candle.samples > 0 && !column.candle.gap)) {
    parts.push(`<text x="${round(plot.left + plot.width / 2)}" y="${round(plot.top + plot.height / 2)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="12" fill="${palette.textMuted}">待开梁</text>`)
  }

  // Three time labels: enough to orient, never a wall of ticks.
  for (const fraction of [0, 0.5, 1]) {
    const at = plot.left + plot.width * fraction
    const t = geometry.window.start + (geometry.window.end - geometry.window.start) * fraction
    const anchor = fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'
    parts.push(`<text x="${round(at)}" y="${round(plot.top + plot.height + 12)}" text-anchor="${anchor}" font-family="${FONT_STACK}" font-size="9" fill="${palette.textMuted}" font-variant-numeric="tabular-nums">${escapeXml(input.formatTime(t))}</text>`)
  }

  if (input.footer !== null) {
    parts.push(`<text x="${round(plot.left)}" y="${round(height - 4)}" font-family="${FONT_STACK}" font-size="8.5" fill="${palette.gapText}">${escapeXml(input.footer)}</text>`)
  }
  parts.push('</svg>')
  return parts.join('')
}

export { GUTTER_RIGHT }
