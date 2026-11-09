import { describe, expect, it } from 'vitest'
import type { MarketCandle } from '../src/shared/market-v1.ts'
import { MARKET_CANDLE_INTERVAL_MS } from '../src/shared/market-v1.ts'
import { chartRange } from '../src/client/market/chart-model.ts'
import { marketBubbleLabel, marketTideGaps, marketTidePath, marketTideSegments, marketVolumeBubbles } from '../src/client/market/tide-model.ts'

const STEP = MARKET_CANDLE_INTERVAL_MS
function candle(at: number, close: number | null = .5, up = 10, down = 10, volume = 0): MarketCandle {
  return { at, open: close, high: close, low: close, close, up_votes: up, down_votes: down, volume }
}

describe('authoritative close-series geometry', () => {
  it('places completed closes at bucket end and a forming close at its observation time', () => {
    const segments = marketTideSegments([candle(0, .4), candle(STEP, .6), candle(2 * STEP, .7)], STEP + 42_000)
    expect(segments).toEqual([[{ at: STEP, ratio: .4 }, { at: STEP + 42_000, ratio: .6 }]])
  })
  it('splits missing and null buckets rather than joining them with invented prices', () => {
    const candles = [candle(0, .4), candle(STEP, .5), candle(3 * STEP, .6), candle(4 * STEP, null), candle(5 * STEP, .7)]
    const segments = marketTideSegments(candles, 6 * STEP)
    expect(segments.map(segment => segment.length)).toEqual([2, 1, 1])
    expect(marketTideGaps(candles)).toEqual([{ from: 2 * STEP, until: 3 * STEP }])
    const paths = segments.map(segment => marketTidePath(segment, p => ({ x: p.at / STEP, y: 100 - p.ratio * 100 }), 100))
    expect(paths[0]!.line).toBe('M1.00,60.00C1.33,56.67 1.67,53.33 2.00,50.00')
    expect(paths[0]!.line).not.toMatch(/[HV]/)
    expect(paths[1]!.area).toBe('')
    expect(paths[1]!.line).toBe('M4.00,40.00')
    expect(paths[2]!.line.startsWith('M6.00')).toBe(true)
  })
  it('passes every sample without overshooting flat, steep or reversing intervals', () => {
    const ratios = [.1, .2, .21, .9, .9, .3, .31, .01, .99]
    const samples = ratios.map((ratio, i) => ({ at: i * 100, ratio }))
    const path = marketTidePath(samples, p => ({ x: p.at, y: p.ratio * 100 }), 100)
    const curves = [...path.line.matchAll(/C([\d.,\s-]+)/g)].map(match => match[1]!.trim().split(/[\s,]+/).map(Number))
    expect(curves).toHaveLength(samples.length - 1)
    for (let i = 0; i < curves.length; i++) {
      const [x1, y1, x2, y2, x, y] = curves[i]!
      expect(x).toBe(samples[i + 1]!.at)
      expect(y).toBeCloseTo(ratios[i + 1]! * 100)
      const previousX = samples[i]!.at, previousY = ratios[i]! * 100
      for (let step = 0; step <= 40; step++) {
        const t = step / 40, u = 1 - t
        const cy = u ** 3 * previousY + 3 * u ** 2 * t * y1! + 3 * u * t ** 2 * y2! + t ** 3 * y!
        const cx = u ** 3 * previousX + 3 * u ** 2 * t * x1! + 3 * u * t ** 2 * x2! + t ** 3 * x!
        expect(cy).toBeGreaterThanOrEqual(Math.min(previousY, y!) - .01)
        expect(cy).toBeLessThanOrEqual(Math.max(previousY, y!) + .01)
        expect(cx).toBeGreaterThanOrEqual(previousX)
        expect(cx).toBeLessThanOrEqual(x!)
      }
    }
  })
  it('preserves both samples at a shared bucket boundary without invalid geometry', () => {
    const samples = marketTideSegments([candle(0, .4), candle(STEP, .6)], STEP)[0]!
    expect(samples.map(p => p.at)).toEqual([STEP, STEP])
    expect(marketTidePath(samples, p => ({ x: p.at / STEP, y: p.ratio * 100 }), 100).line).toBe('M1.00,40.00L1.00,60.00')
  })
  it('keeps zero-vote data empty instead of inventing a half-full pond', () => {
    expect(marketTideSegments([candle(0, null, 0, 0)], STEP)).toEqual([])
    expect(marketVolumeBubbles([candle(0, null, 0, 0)])).toEqual([])
  })
  it('uses each series true interval for continuity and keeps pre-opening samples', () => {
    const raw = [candle(0, .4), candle(60_000, .5), candle(180_000, .6)]
    expect(marketTideSegments(raw, 240_000, 60_000).map(segment => segment.length)).toEqual([2, 1])
    expect(marketTideGaps(raw, 60_000)).toEqual([{ from: 120_000, until: 180_000 }])
    expect(marketTideSegments([candle(0, .4), candle(300_000, .5)], 600_000, 300_000)).toHaveLength(1)
  })
  it('does not flatten close geometry with unrendered intrabucket extremes', () => {
    const candles = [{ ...candle(0, .5), high: 1, low: 0 }]
    expect(chartRange(candles, [], 'ohlc')).toEqual({ min: 0, max: 1 })
    expect(chartRange(candles, [], 'close').max).toBeLessThan(.55)
    expect(chartRange(candles, [], 'close').min).toBeGreaterThan(.45)
    expect(chartRange(candles, [{ at: 0, case_id: 'case-test', up_votes: 90, down_votes: 10, sequence: 1 }], 'close').max).toBeGreaterThan(.9)
  })
})

describe('community-volume bubbles', () => {
  it('uses official volume and reports directions only with an adjacent matching count delta', () => {
    const bubbles = marketVolumeBubbles([candle(0, .5, 100, 100, 0), candle(STEP, 103 / 205, 103, 102, 5), candle(2 * STEP, 103 / 208, 103, 105, 3)])
    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]!.volume).toBe(8n)
    expect(bubbles[0]!.up).toBe(3n)
    expect(bubbles[0]!.down).toBe(5n)
    expect(marketBubbleLabel(bubbles[0]!, 'UTC')).toContain('本段上香 8 炷')
    expect(marketBubbleLabel(bubbles[0]!, 'UTC')).toContain('夯 3 · 拉 5')
  })
  it('accepts a proven zero baseline but keeps partial history and gaps unknown', () => {
    const exact = marketVolumeBubbles([candle(0, .2, 2, 8, 10), candle(STEP, .25, 3, 9, 2)])[0]!
    expect(exact).toMatchObject({ volume: 12n, up: 3n, down: 9n })
    const first = marketVolumeBubbles([candle(STEP, .5, 1000, 1000, 4)])[0]!
    expect(first.volume).toBe(4n)
    expect(first.up).toBeNull()
    expect(marketBubbleLabel(first, 'UTC')).toContain('方向明细缺失')
    expect(marketBubbleLabel(first, 'UTC')).not.toContain('全网')
    const gap = marketVolumeBubbles([candle(0), candle(2 * STEP, .5, 12, 12, 4)])[0]!
    expect(gap.up).toBeNull()
    const inconsistent = marketVolumeBubbles([candle(0), candle(STEP, .5, 12, 12, 5)])[0]!
    expect(inconsistent.up).toBeNull()
  })
  it('bounds a full day to 48 particles with a finite radius even after large dumps', () => {
    const count = 24 * 60 * 60_000 / STEP
    const bubbles = marketVolumeBubbles(Array.from({ length: count }, (_, index) => candle(index * STEP, .5, (index + 1) * 250, (index + 1) * 250, 500)))
    expect(bubbles).toHaveLength(48)
    expect(bubbles.every(b => b.radius <= 14 && Number.isFinite(b.radius))).toBe(true)
    expect(bubbles.reduce((total, b) => total + b.volume, 0n)).toBe(BigInt(count * 500))
  })
})
