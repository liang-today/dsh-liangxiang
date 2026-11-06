import { describe, expect, it } from 'vitest'
import {
  aggregateBars,
  accrueBarsSample,
  barsRatio,
  createBarsAccumulator,
  finalizeBarsBuckets,
  fromBarsDay,
  layoutBars,
  toBarsDay,
  type BarsSample,
} from '../src/domain/index.ts'
import { BARS_BUCKET_MS, type BarsCandle } from '../src/shared/bars-v1.ts'

const T0 = Date.UTC(2026, 10, 5, 1, 0, 0) // 2026-11-05 01:00 UTC, on a 5-minute boundary
const DAY = '2026-11-05'

function sample(offsetMs: number, upVotes: number, downVotes: number, caseId = 'case-a'): BarsSample {
  return { t: T0 + offsetMs, upVotes, downVotes, caseId, caseTitle: '今日梁案', policyVersion: 'liangzi-v0.2-25-50-70-85-95' }
}

function accumulator(): ReturnType<typeof createBarsAccumulator> {
  return createBarsAccumulator({ businessDate: DAY, intervalMs: BARS_BUCKET_MS, sampleMs: 1_000 })
}

function close(acc: ReturnType<typeof createBarsAccumulator>): BarsCandle[] {
  finalizeBarsBuckets(acc)
  return acc.buckets
}

describe('bars ratio', () => {
  it('is null until a vote exists, so a quiet case reads as 待开梁 rather than 50/50', () => {
    expect(barsRatio(0, 0)).toBeNull()
    expect(barsRatio(3, 1)).toBeCloseTo(0.75)
    expect(barsRatio(0, 4)).toBe(0)
  })
})

describe('bars accumulator', () => {
  it('keeps one candle per bucket with open/high/low/close taken from the counts', () => {
    const acc = accumulator()
    accrueBarsSample(acc, sample(0, 0, 0))
    accrueBarsSample(acc, sample(10_000, 2, 0))
    accrueBarsSample(acc, sample(20_000, 3, 1))
    accrueBarsSample(acc, sample(30_000, 3, 2))
    const buckets = close(acc)
    expect(buckets).toHaveLength(1)
    const [candle] = buckets as [BarsCandle]
    expect(candle.t).toBe(T0)
    expect(candle.open).toBe(1)
    expect(candle.close).toBeCloseTo(3 / 5)
    expect(candle.high).toBe(1)
    expect(candle.low).toBe(0.6)
    expect(candle.upVotes).toBe(3)
    expect(candle.downVotes).toBe(2)
    expect(candle.samples).toBe(4)
    expect(candle.gap).toBe(false)
  })

  it('marks only the silent buckets inside an outage, never the live ones around it', () => {
    const acc = accumulator()
    accrueBarsSample(acc, sample(0, 1, 0))
    // 11 quiet minutes: the outage spans two whole buckets of its own.
    accrueBarsSample(acc, sample(11 * 60_000, 2, 0))
    const buckets = close(acc)
    expect(buckets.length).toBeGreaterThanOrEqual(1)
    const gapBuckets = buckets.filter(candle => candle.gap)
    expect(gapBuckets.length).toBeGreaterThan(0)
    expect(gapBuckets.at(-1)?.samples).toBe(0)
    for (const candle of gapBuckets) {
      expect(candle.upVotes).toBe(0)
      expect(candle.downVotes).toBe(0)
      expect(candle.close).toBeNull()
    }
    expect(acc.gaps).toHaveLength(1)
    expect(acc.gaps[0]?.reason).toBe('host-down')
    // The bucket that owns the outage start still carries the last real count.
    expect(buckets[0]?.close).toBeCloseTo(1)
    expect(buckets.at(-1)?.close).toBeCloseTo(1)
  })

  it('breaks the series when the case changes instead of bridging two cases', () => {
    const acc = accumulator()
    accrueBarsSample(acc, sample(0, 4, 0, 'case-a'))
    accrueBarsSample(acc, sample(30_000, 4, 0, 'case-a'))
    accrueBarsSample(acc, sample(BARS_BUCKET_MS, 0, 0, 'case-b'))
    accrueBarsSample(acc, sample(BARS_BUCKET_MS + 30_000, 1, 0, 'case-b'))
    close(acc)
    expect(acc.breaks).toEqual([T0 + BARS_BUCKET_MS])
    expect(acc.cases.map(span => span.caseId)).toEqual(['case-a', 'case-b'])
    const first = acc.buckets.find(candle => candle.t === T0)
    const second = acc.buckets.find(candle => candle.t === T0 + BARS_BUCKET_MS)
    expect(first?.caseId).toBe('case-a')
    expect(second?.caseId).toBe('case-b')
    expect(second?.close).toBeCloseTo(1)
  })

  it('rejects a sample that travels back in time', () => {
    const acc = accumulator()
    accrueBarsSample(acc, sample(60_000, 1, 0))
    expect(() => accrueBarsSample(acc, sample(0, 1, 0))).toThrow()
  })

  it('round-trips through the day file shape without losing the series', () => {
    const acc = accumulator()
    accrueBarsSample(acc, sample(0, 1, 0))
    accrueBarsSample(acc, sample(5 * 60_000, 3, 1))
    finalizeBarsBuckets(acc)
    const day = toBarsDay(acc, null)
    const restored = fromBarsDay(day, 1_000)
    expect(restored.buckets).toHaveLength(day.buckets.length)
    expect(restored.buckets.at(-1)?.close).toBeCloseTo(day.buckets.at(-1)?.close ?? -1)
    expect(restored.lastClose).toBeCloseTo(0.75)
    expect(restored.gapThresholdMs).toBe(acc.gapThresholdMs)
  })
})

describe('bars aggregation', () => {
  it('sums raw counts into a longer interval and keeps the last close', () => {
    const acc = accumulator()
    accrueBarsSample(acc, sample(0, 2, 0))
    accrueBarsSample(acc, sample(5 * 60_000, 4, 1))
    accrueBarsSample(acc, sample(10 * 60_000, 6, 1))
    const buckets = close(acc)
    const hourly = aggregateBars(buckets, BARS_BUCKET_MS, 15 * 60_000)
    expect(hourly).toHaveLength(1)
    expect(hourly[0]?.upVotes).toBe(6)
    expect(hourly[0]?.downVotes).toBe(1)
    expect(hourly[0]?.close).toBeCloseTo(6 / 7)
  })

  it('never invents a candle for a longer interval the day does not cover', () => {
    expect(aggregateBars([], BARS_BUCKET_MS, 15 * 60_000)).toEqual([])
  })
})

describe('bars layout', () => {
  it('lays candles left to right on the same plot and splits the line at gaps', () => {
    const acc = accumulator()
    accrueBarsSample(acc, sample(0, 1, 0))
    accrueBarsSample(acc, sample(10 * 60_000, 2, 1))
    const buckets = close(acc)
    const geometry = layoutBars(buckets, { width: 640, height: 220, intervalMs: BARS_BUCKET_MS })
    expect(geometry.columns.length).toBe(buckets.length)
    const xs = geometry.columns.map(column => column.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    for (const column of geometry.columns) {
      expect(column.width).toBeGreaterThan(0)
      expect(column.x).toBeGreaterThanOrEqual(geometry.plot.left)
      expect(column.x + column.width).toBeLessThanOrEqual(geometry.plot.left + geometry.plot.width)
    }
    // A gap between two live buckets means the connecting segment is absent.
    expect(geometry.segments.length).toBeGreaterThan(1)
  })
})
