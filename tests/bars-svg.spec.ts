import { describe, expect, it } from 'vitest'
import { barsRatio, layoutBars, renderBarsSvg } from '../src/domain/index.ts'
import { BARS_BUCKET_MS, type BarsCandle } from '../src/shared/bars-v1.ts'

const T0 = Date.UTC(2026, 10, 5, 1, 0, 0)

function candle(index: number, upVotes: number, downVotes: number, gap = false): BarsCandle {
  const total = upVotes + downVotes
  const ratio = barsRatio(upVotes, downVotes)
  return {
    t: T0 + index * BARS_BUCKET_MS,
    open: ratio,
    high: ratio,
    low: ratio,
    close: ratio,
    upVotes,
    downVotes,
    samples: total === 0 ? 0 : 12,
    caseId: 'case-a',
    gap,
  }
}

function render(candles: BarsCandle[], footer: string | null = null): string {
  const width = 640
  const height = 240
  return renderBarsSvg({
    geometry: layoutBars(candles, { width, height, intervalMs: BARS_BUCKET_MS }),
    width,
    height,
    theme: 'light',
    title: '梁位走势 <今日>',
    subtitle: '2026-11-05',
    footer,
    emptyText: '今天还没有观察记录',
    gapLabel: '未统计',
    formatTime: (t) => new Date(t).toISOString().slice(11, 16),
    formatRatio: (value) => `${(Math.trunc(value * 10_000) / 100).toFixed(2)}%`,
  })
}

describe('bars svg', () => {
  it('is a self-contained document with no script and no external reference', () => {
    const svg = render([candle(0, 3, 1), candle(1, 4, 1)])
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/javascript:/i)
    // The only URL allowed is the SVG namespace name; nothing is fetched.
    expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//i)
    expect(svg).not.toMatch(/\b(src|href)=/i)
    expect(svg).not.toMatch(/url\(/i)
    expect(svg).not.toMatch(/xlink:href/i)
    expect(svg).not.toMatch(/<foreignObject/i)
  })

  it('renders the same bytes for the same window', () => {
    const candles = [candle(0, 3, 1), candle(1, 2, 2)]
    expect(render(candles)).toBe(render(candles))
  })

  it('escapes copy so a case title can never inject markup', () => {
    const svg = render([candle(0, 1, 0)])
    expect(svg).toContain('&lt;今日&gt;')
    expect(svg).not.toContain('<今日>')
  })

  it('labels an outage as 未统计 instead of drawing a fake flat line', () => {
    const svg = render([candle(0, 3, 1), candle(1, 0, 0, true), candle(2, 4, 1)], '虚线：本机未运行')
    expect(svg).toContain('未统计')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('虚线：本机未运行')
    // One band per outage, not one per empty bucket.
    expect(svg.split('未统计').length - 1).toBe(1)
  })

  it('marks every candle with data attributes and a native tooltip', () => {
    const svg = render([candle(0, 3, 1)])
    expect(svg).toContain('data-candle=')
    expect(svg).toContain('data-up="3"')
    expect(svg).toContain('data-down="1"')
    expect(svg).toContain('<title>')
  })

  it('explains an empty day rather than rendering a blank box', () => {
    const svg = render([])
    expect(svg).toContain('今天还没有观察记录')
    expect(svg).toContain('<svg')
  })

  it('follows the requested theme', () => {
    const light = render([candle(0, 3, 1)])
    const dark = renderBarsSvg({
      geometry: layoutBars([candle(0, 3, 1)], { width: 640, height: 240, intervalMs: BARS_BUCKET_MS }),
      width: 640,
      height: 240,
      theme: 'dark',
      title: '梁位走势',
      subtitle: '2026-11-05',
      footer: null,
      emptyText: '空',
      gapLabel: '未统计',
      formatTime: (t) => new Date(t).toISOString().slice(11, 16),
      formatRatio: (value) => `${value}`,
    })
    expect(light).not.toBe(dark)
  })

  it('shows waiting without a fabricated percentage for a zero-vote day', () => {
    const svg = render([{ ...candle(0, 0, 0), samples: 1 }])
    expect(svg).toContain('待开梁')
    expect(svg).not.toContain('50%')
    expect(svg).not.toContain('50.00%')
    expect(svg).not.toContain('data-candle=')
  })

})
