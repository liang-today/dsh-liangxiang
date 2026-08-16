/**
 * P0 Liangzi threshold matrix: WAITING at zero votes, exact 60/70/80/90
 * boundaries, policy validation (monotonic, in (0,1), no overlap/gap).
 */
import { describe, expect, it } from 'vitest'
import {
  DomainError,
  assertValidThresholdPolicy,
  deriveLiangziState,
  formatRatioPercents,
  liangziStateForUpRatio,
  liangziUpRatioBand,
  type LiangziState,
} from '../src/domain/index.ts'
import { liangziRatioRangeText } from '../src/shared/index.ts'

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

describe('state bands and their displayed percentages', () => {
  it('exposes the frozen band of every state', () => {
    expect(liangziUpRatioBand('waiting')).toEqual({ minInclusive: null, maxExclusive: null })
    expect(liangziUpRatioBand('liang_gong')).toEqual({ minInclusive: null, maxExclusive: 0.6 })
    expect(liangziUpRatioBand('liang_zong')).toEqual({ minInclusive: 0.6, maxExclusive: 0.7 })
    expect(liangziUpRatioBand('liang_shen')).toEqual({ minInclusive: 0.7, maxExclusive: 0.8 })
    expect(liangziUpRatioBand('liang_sheng')).toEqual({ minInclusive: 0.8, maxExclusive: 0.9 })
    expect(liangziUpRatioBand('liang_zu')).toEqual({ minInclusive: 0.9, maxExclusive: null })
  })

  it('renders the band as user-facing copy', () => {
    expect(liangziRatioRangeText('waiting')).toBe('尚无投票')
    expect(liangziRatioRangeText('liang_gong')).toBe('夯率 < 60%')
    expect(liangziRatioRangeText('liang_sheng')).toBe('80% ≤ 夯率 < 90%')
    expect(liangziRatioRangeText('liang_zu')).toBe('夯率 ≥ 90%')
  })

  it('truncates the displayed 夯 percent instead of rounding over a boundary', () => {
    // 449/501 = 89.62% is still 梁圣; rounding would print a 梁祖-looking 90%.
    expect(deriveLiangziState(449, 52)).toBe('liang_sheng')
    expect(formatRatioPercents(449, 52)).toEqual({ up: '89%', down: '11%' })
  })

  it('zero votes render `--` on both sides', () => {
    expect(formatRatioPercents(0, 0)).toEqual({ up: '--', down: '--' })
  })

  it('the displayed percent always falls inside the rendered state band', () => {
    for (let upVotes = 0; upVotes <= 1000; upVotes += 1) {
      const downVotes = 1000 - upVotes
      const state = deriveLiangziState(upVotes, downVotes)
      const { minInclusive, maxExclusive } = liangziUpRatioBand(state)
      const shown = Number(formatRatioPercents(upVotes, downVotes).up.replace('%', '')) / 100
      if (minInclusive !== null) expect(shown).toBeGreaterThanOrEqual(minInclusive)
      if (maxExclusive !== null) expect(shown).toBeLessThan(maxExclusive)
    }
  })

  it('the pair always sums to 100%', () => {
    for (const [up, down] of [[1, 2], [449, 52], [10_665, 2_181], [7, 0]] as const) {
      const percents = formatRatioPercents(up, down)
      const sum = Number(percents.up.replace('%', '')) + Number(percents.down.replace('%', ''))
      expect(sum).toBe(100)
    }
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
