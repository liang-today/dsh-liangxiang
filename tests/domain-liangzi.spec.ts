/**
 * P0 Liangzi threshold matrix: WAITING at zero votes, exact 60/70/80/90
 * boundaries, policy validation (monotonic, in (0,1), no overlap/gap).
 */
import { describe, expect, it } from 'vitest'
import {
  DomainError,
  assertValidThresholdPolicy,
  deriveLiangziState,
  liangziStateForUpRatio,
  type LiangziState,
} from '../src/domain/index.ts'

describe('zero votes', () => {
  it('0/0 is WAITING (待开梁), never a fake 50/50', () => {
    expect(deriveLiangziState(0, 0)).toBe('waiting')
  })
})

describe('exact threshold boundaries from integer counts', () => {
  const cases: Array<[up: number, down: number, expected: LiangziState]> = [
    [0, 100, 'liang_gong'], //   0%
    [59_999, 40_001, 'liang_gong'], // 59.999%
    [60_000, 40_000, 'liang_zong'], // 60%
    [69_999, 30_001, 'liang_zong'], // 69.999%
    [70_000, 30_000, 'liang_shen'], // 70%
    [79_999, 20_001, 'liang_shen'], // 79.999%
    [80_000, 20_000, 'liang_sheng'], // 80%
    [89_999, 10_001, 'liang_sheng'], // 89.999%
    [90_000, 10_000, 'liang_zu'], // 90%
    [100_000, 0, 'liang_zu'], // 100%
  ]

  it.each(cases)('up=%d down=%d -> %s', (up, down, expected) => {
    expect(deriveLiangziState(up, down)).toBe(expected)
  })
})

describe('ratio-level boundaries', () => {
  const cases: Array<[ratio: number, expected: LiangziState]> = [
    [0, 'liang_gong'],
    [0.59999, 'liang_gong'],
    [0.6, 'liang_zong'],
    [0.69999, 'liang_zong'],
    [0.7, 'liang_shen'],
    [0.79999, 'liang_shen'],
    [0.8, 'liang_sheng'],
    [0.89999, 'liang_sheng'],
    [0.9, 'liang_zu'],
    [1, 'liang_zu'],
  ]

  it.each(cases)('upRatio=%d -> %s', (ratio, expected) => {
    expect(liangziStateForUpRatio(ratio)).toBe(expected)
  })
})

describe('threshold policy validation', () => {
  it('accepts the frozen default', () => {
    expect(() => assertValidThresholdPolicy({ boundaries: [0.6, 0.7, 0.8, 0.9] })).not.toThrow()
  })

  it.each([
    [{ boundaries: [0.6, 0.7, 0.8] as unknown as [number, number, number, number] }],
    [{ boundaries: [0.6, 0.6, 0.8, 0.9] as [number, number, number, number] }],
    [{ boundaries: [0.9, 0.8, 0.7, 0.6] as [number, number, number, number] }],
    [{ boundaries: [0, 0.7, 0.8, 0.9] as [number, number, number, number] }],
    [{ boundaries: [0.6, 0.7, 0.8, 1] as [number, number, number, number] }],
    [{ boundaries: [0.6, Number.NaN, 0.8, 0.9] as [number, number, number, number] }],
  ])('rejects malformed policy %#', (policy) => {
    expect(() => assertValidThresholdPolicy(policy)).toThrow(DomainError)
  })

  it('rejects out-of-range ratios and invalid counts', () => {
    expect(() => liangziStateForUpRatio(-0.1)).toThrow(DomainError)
    expect(() => liangziStateForUpRatio(1.1)).toThrow(DomainError)
    expect(() => liangziStateForUpRatio(Number.NaN)).toThrow(DomainError)
    expect(() => deriveLiangziState(-1, 0)).toThrow(DomainError)
    expect(() => deriveLiangziState(0, Number.NaN)).toThrow(DomainError)
    expect(() => deriveLiangziState(1.5, 2)).toThrow(DomainError)
  })
})
