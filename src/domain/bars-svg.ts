/**
 * Server-side rendering of the 走势 chart to a standalone SVG string.
 *
 * This is the "give me a URL" side of the feature: the Host answers
 * `/liangxiang/api/bars.svg` with bytes, so a page can embed the chart without
 * running our client, and the same geometry that the panel draws is reused
 * here — one layout, two renderers.
 *
 * Hard constraints, because these bytes land in other people's pages:
 * - no `<script>`, no `<foreignObject>`, no external references, no fonts
 * - every text node escaped; no user-authored text is passed through
 * - deterministic: same input, same bytes (cache keys hash the output)
 * - no pointer-only information: each candle carries a native `<title>`
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
  line: string
}

export const BARS_SVG_PALETTES: Record<'light' | 'dark', BarsSvgPalette> = {
  light: {
    background: '#fffdf8',
    text: '#3c3730',
    textMuted: '#8a8271',
    grid: 'rgba(60,55,48,0.10)',
    frame: 'rgba(60,55,48,0.22)',
    up: '#b4522f',
    down: '#5c7182',
    gap: 'rgba(138,130,113,0.14)',
    gapText: '#8a8271',
    line: 'rgba(60,55,48,0.42)',
  },
  dark: {
    background: '#16161a',
    text: '#e6e1d6',
    textMuted: '#9a9385',
    grid: 'rgba(230,225,214,0.10)',
    frame: 'rgba(230,225,214,0.20)',
    up: '#d5764c',
    down: '#8ba2b5',
    gap: 'rgba(154,147,133,0.16)',
    gapText: '#9a9385',
    line: 'rgba(230,225,214,0.40)',
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

const FONT_STACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"

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

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}" role="img" aria-label="${label}">`)
  parts.push(`<title>${label}</title>`)
  parts.push(`<desc>${escapeXml(input.subtitle)}</desc>`)
  parts.push(`<rect width="100%" height="100%" fill="${palette.background}"/>`)

  if (columns.length === 0) {
    parts.push(`<text x="${round(width / 2)}" y="${round(height / 2)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="12" fill="${palette.textMuted}">${escapeXml(input.emptyText)}</text>`)
    parts.push('</svg>')
    return parts.join('')
  }

  // Grid + y labels.
  for (const tick of geometry.yTicks) {
    const y = round(tick.y)
    parts.push(`<line x1="${round(plot.left)}" y1="${y}" x2="${round(plot.left + plot.width)}" y2="${y}" stroke="${palette.grid}" stroke-width="1"/>`)
    parts.push(`<text x="${round(plot.left + plot.width + 6)}" y="${y + 3}" font-family="${FONT_STACK}" font-size="9" fill="${palette.textMuted}">${escapeXml(ratioOf(tick.value))}</text>`)
  }

  // Outage bands: drawn under the candles, labelled once per contiguous run.
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
    parts.push(`<rect x="${round(run.from)}" y="${round(plot.top)}" width="${round(Math.max(1, run.width))}" height="${round(plot.height)}" fill="${palette.gap}"/>`)
    parts.push(`<line x1="${round(run.from)}" y1="${round(plot.top)}" x2="${round(run.from)}" y2="${round(plot.top + plot.height)}" stroke="${palette.gapText}" stroke-width="1" stroke-dasharray="3 3"/>`)
    parts.push(`<line x1="${round(run.from + run.width)}" y1="${round(plot.top)}" x2="${round(run.from + run.width)}" y2="${round(plot.top + plot.height)}" stroke="${palette.gapText}" stroke-width="1" stroke-dasharray="3 3"/>`)
    if (run.width >= 52) {
      parts.push(`<text x="${round(run.from + run.width / 2)}" y="${round(plot.top + 12)}" text-anchor="middle" font-family="${FONT_STACK}" font-size="9" fill="${palette.gapText}">${escapeXml(input.gapLabel)}</text>`)
    }
  }

  // Candles.
  for (const column of columns) {
    const { candle } = column
    if (candle.gap || candle.close === null) continue
    const open = candle.open ?? candle.close
    const rising = candle.close >= open
    const color = rising ? palette.up : palette.down
    const bodyWidth = Math.max(1, round(Math.min(11, column.width - (column.width > 3 ? 1 : 0))))
    const cx = round(column.x + column.width / 2)
    const high = candle.high ?? candle.close
    const low = candle.low ?? candle.close
    const yHigh = round(plot.top + ((geometry.domain.high - high) / (geometry.domain.high - geometry.domain.low)) * plot.height)
    const yLow = round(plot.top + ((geometry.domain.high - low) / (geometry.domain.high - geometry.domain.low)) * plot.height)
    if (yLow - yHigh > 0.5) {
      parts.push(`<line x1="${cx}" y1="${yHigh}" x2="${cx}" y2="${yLow}" stroke="${color}" stroke-width="1"/>`)
    }
    const yOpen = plot.top + ((geometry.domain.high - open) / (geometry.domain.high - geometry.domain.low)) * plot.height
    const yClose = plot.top + ((geometry.domain.high - candle.close) / (geometry.domain.high - geometry.domain.low)) * plot.height
    const bodyY = Math.min(yOpen, yClose)
    const bodyH = Math.max(1, Math.abs(yClose - yOpen))
    parts.push(`<g><title>${escapeXml(`${input.formatTime(candle.t)} ${ratioOf(candle.close)}`)}</title>`)
    parts.push(`<rect x="${round(cx - bodyWidth / 2)}" y="${round(bodyY)}" width="${bodyWidth}" height="${round(bodyH)}" fill="${rising ? 'none' : color}" stroke="${color}" stroke-width="1" data-candle="1" data-t="${candle.t}" data-close="${ratioOf(candle.close)}" data-up="${candle.upVotes}" data-down="${candle.downVotes}" data-samples="${candle.samples}"/>`)
    parts.push('</g>')
  }

  // Close path, split at outages and case changes.
  for (const segment of geometry.segments) {
    const points = segment.points.map(point => `${round(point.x)},${round(point.y)}`).join(' ')
    if (segment.points.length < 2) continue
    parts.push(`<polyline points="${points}" fill="none" stroke="${palette.line}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>`)
  }

  // Current value marker in the right gutter.
  const lastColumn = columns.at(-1)
  const lastValued = [...columns].reverse().find(column => column.candle.close !== null && !column.candle.gap)
  if (lastValued !== undefined && lastValued.candle.close !== null) {
    const y = round(plot.top + ((geometry.domain.high - lastValued.candle.close) / (geometry.domain.high - geometry.domain.low)) * plot.height)
    parts.push(`<line x1="${round(plot.left)}" y1="${y}" x2="${round(plot.left + plot.width)}" y2="${y}" stroke="${palette.textMuted}" stroke-width="1" stroke-dasharray="2 4" opacity="0.6"/>`)
    parts.push(`<circle cx="${round(lastColumn === undefined ? plot.left : plot.left + plot.width)}" cy="${y}" r="2" fill="${palette.line}"/>`)
  }

  // Axis frame.
  parts.push(`<rect x="${round(plot.left)}" y="${round(plot.top)}" width="${round(plot.width)}" height="${round(plot.height)}" fill="none" stroke="${palette.frame}" stroke-width="1"/>`)

  for (const tick of geometry.xTicks) {
    const t = geometry.window.start + ((tick.x - plot.left) / plot.width) * (geometry.window.end - geometry.window.start)
    const anchor = tick.x > plot.left + plot.width - 2 ? 'end' : tick.x < plot.left + 2 ? 'start' : 'middle'
    parts.push(`<text x="${round(tick.x)}" y="${round(plot.top + plot.height + 12)}" text-anchor="${anchor}" font-family="${FONT_STACK}" font-size="9" fill="${palette.textMuted}">${escapeXml(input.formatTime(t))}</text>`)
  }

  parts.push(`<text x="${round(plot.left)}" y="${round(plot.top - 1)}" font-family="${FONT_STACK}" font-size="10" fill="${palette.textMuted}">${escapeXml(input.subtitle)}</text>`)
  if (input.footer !== null) {
    parts.push(`<text x="${round(plot.left)}" y="${round(height - 2)}" font-family="${FONT_STACK}" font-size="9" fill="${palette.textMuted}">${escapeXml(input.footer)}</text>`)
  }
  parts.push('</svg>')
  return parts.join('')
}
