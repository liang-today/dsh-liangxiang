/**
 * P0 usage-ledger folds: baseline on first sighting, HWM diffing, no double
 * counting under replay/replacement, daily accumulation.
 */
import { describe, expect, it } from 'vitest'
import { UsageProjection, type UsageProjectionSink } from '../src/host/usage-projection.ts'
import { addDailyUsage, EMPTY_DAILY_USAGE, foldUsageObservation } from '../src/host/usage-ledger.ts'
import { createBusinessDateProvider } from '../src/shared/business-date.ts'

const NOON_SHANGHAI = Date.UTC(2026, 7, 16, 4, 0, 0)
const BUSINESS_DATE = '2026-08-16'

function buckets(uncachedInput: number, output: number) {
  return {
    uncachedInputTokens: uncachedInput,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: output,
  }
}

function memorySink(): UsageProjectionSink {
  return {
    putWatermark: () => undefined,
    putDailyUsage: () => undefined,
    deleteDailyUsage: () => undefined,
  }
}

function projection(now = NOON_SHANGHAI): UsageProjection {
  return new UsageProjection({
    dates: createBusinessDateProvider('Asia/Shanghai'),
    clock: { now: () => now },
    warn: () => undefined,
  })
}

describe('foldUsageObservation', () => {
  it('baselines on first sighting (no retroactive credit)', () => {
    const fold = foldUsageObservation(undefined, { inputTokens: 120_000, outputTokens: 40_000 })
    expect(fold.deltaInput).toBe(0)
    expect(fold.deltaOutput).toBe(0)
    expect(fold.watermark).toEqual({ inputHwm: 120_000, outputHwm: 40_000 })
  })

  it('credits only growth above the watermark', () => {
    const fold = foldUsageObservation(
      { inputHwm: 120_000, outputHwm: 40_000 },
      { inputTokens: 150_000, outputTokens: 41_000 },
    )
    expect(fold.deltaInput).toBe(30_000)
    expect(fold.deltaOutput).toBe(1_000)
    expect(fold.watermark).toEqual({ inputHwm: 150_000, outputHwm: 41_000 })
  })

  it('replaying the identical cumulative value contributes nothing', () => {
    const first = foldUsageObservation(undefined, { inputTokens: 50_000, outputTokens: 10_000 })
    const replay = foldUsageObservation(first.watermark, { inputTokens: 50_000, outputTokens: 10_000 })
    expect(replay.deltaInput).toBe(0)
    expect(replay.deltaOutput).toBe(0)
  })

  it('a chunk->final replacement dip cannot double count on recovery', () => {
    // chunk reported 100k, final replaced it with 90k, next step adds 50k.
    const afterChunk = foldUsageObservation(undefined, { inputTokens: 0, outputTokens: 0 })
    const grew = foldUsageObservation(afterChunk.watermark, { inputTokens: 100_000, outputTokens: 0 })
    expect(grew.deltaInput).toBe(100_000)
    const dipped = foldUsageObservation(grew.watermark, { inputTokens: 90_000, outputTokens: 0 })
    expect(dipped.deltaInput).toBe(0)
    expect(dipped.watermark.inputHwm).toBe(100_000) // HWM never lowers
    const recovered = foldUsageObservation(dipped.watermark, { inputTokens: 140_000, outputTokens: 0 })
    expect(recovered.deltaInput).toBe(40_000) // total credited: 140k, true value
  })
})

describe('addDailyUsage', () => {
  it('accumulates deltas with the newest observation instant', () => {
    let record = EMPTY_DAILY_USAGE
    record = addDailyUsage(record, 30_000, 10_000, 1_000)
    record = addDailyUsage(record, 5_000, 5_000, 2_000)
    expect(record).toEqual({ inputTokens: 35_000, outputTokens: 15_000, weightCarry: 0, observedAt: 2_000 })
  })
})

describe('UsageProjection.hydrate merge', () => {
  it('does not rewind a catch-up baseline when persist hydrates stale watermarks', () => {
    const usage = projection()
    usage.observe('s1', buckets(2_000_000, 150_000), { kind: 'catchup' })
    expect(usage.effectiveTokensFor(BUSINESS_DATE)).toBe(0)

    usage.hydrate(
      new Map([['s1', { inputHwm: 50_000, outputHwm: 0 }]]),
      new Map(),
      memorySink(),
    )
    usage.observe('s1', buckets(2_000_000, 150_000), { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(BUSINESS_DATE)).toBe(0)
  })

  it('still credits the persist-to-now gap when hydrate wins the race', () => {
    const usage = projection()
    usage.hydrate(
      new Map([['s1', { inputHwm: 100_000, outputHwm: 0 }]]),
      new Map(),
      memorySink(),
    )
    usage.observe('s1', buckets(150_000, 0), { kind: 'catchup' })
    expect(usage.effectiveTokensFor(BUSINESS_DATE)).toBe(50_000)
  })

  it('keeps in-memory watermarks for sessions persist does not know', () => {
    const usage = projection()
    usage.observe('live-only', buckets(80_000, 0), { kind: 'catchup' })
    usage.hydrate(new Map(), new Map(), memorySink())
    usage.observe('live-only', buckets(80_000, 0), { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(BUSINESS_DATE)).toBe(0)
  })
})
