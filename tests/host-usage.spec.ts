/**
 * P0 usage-ledger folds: baseline on first sighting, HWM diffing, no double
 * counting under replay/replacement, daily accumulation.
 */
import { describe, expect, it } from 'vitest'
import { addDailyUsage, EMPTY_DAILY_USAGE, foldUsageObservation } from '../src/host/usage-ledger.ts'

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
