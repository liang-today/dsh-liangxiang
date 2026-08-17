/**
 * P0 Liangzi threshold matrix: WAITING at zero votes, exact 50/70/85/95
 * boundaries, policy validation (monotonic, in (0,1), no overlap/gap).
 */
import { describe, expect, it } from 'vitest'
import {
  DomainError,
  assertValidThresholdPolicy,
  deriveLiangziState,
  formatLiangPosition,
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
    [49_999, 50_001, 'liang_gong'], // 49.999%
    [50_000, 50_000, 'liang_zong'], // 50%
    [69_999, 30_001, 'liang_zong'], // 69.999%
    [70_000, 30_000, 'liang_shen'], // 70%
    [84_999, 15_001, 'liang_shen'], // 84.999%
    [85_000, 15_000, 'liang_sheng'], // 85%
    [94_999, 5_001, 'liang_sheng'], // 94.999%
    [95_000, 5_000, 'liang_zu'], // 95%
    [100_000, 0, 'liang_zu'], // 100%
  ]

  it.each(cases)('up=%d down=%d -> %s', (up, down, expected) => {
    expect(deriveLiangziState(up, down)).toBe(expected)
  })
})

describe('ratio-level boundaries', () => {
  const cases: Array<[ratio: number, expected: LiangziState]> = [
    [0, 'liang_gong'],
    [0.49999, 'liang_gong'],
    [0.5, 'liang_zong'],
    [0.69999, 'liang_zong'],
    [0.7, 'liang_shen'],
    [0.84999, 'liang_shen'],
    [0.85, 'liang_sheng'],
    [0.94999, 'liang_sheng'],
    [0.95, 'liang_zu'],
    [1, 'liang_zu'],
  ]

  it.each(cases)('upRatio=%d -> %s', (ratio, expected) => {
    expect(liangziStateForUpRatio(ratio)).toBe(expected)
  })
})

describe('state bands and their displayed percentages', () => {
  it('exposes the frozen band of every state', () => {
    expect(liangziUpRatioBand('waiting')).toEqual({ minInclusive: null, maxExclusive: null })
    expect(liangziUpRatioBand('liang_gong')).toEqual({ minInclusive: null, maxExclusive: 0.5 })
    expect(liangziUpRatioBand('liang_zong')).toEqual({ minInclusive: 0.5, maxExclusive: 0.7 })
    expect(liangziUpRatioBand('liang_shen')).toEqual({ minInclusive: 0.7, maxExclusive: 0.85 })
    expect(liangziUpRatioBand('liang_sheng')).toEqual({ minInclusive: 0.85, maxExclusive: 0.95 })
    expect(liangziUpRatioBand('liang_zu')).toEqual({ minInclusive: 0.95, maxExclusive: null })
  })

  it('renders the band as user-facing copy', () => {
    expect(liangziRatioRangeText('waiting')).toBe('尚无投票')
    expect(liangziRatioRangeText('liang_gong')).toBe('夯率 < 50%')
    expect(liangziRatioRangeText('liang_sheng')).toBe('85% ≤ 夯率 < 95%')
    expect(liangziRatioRangeText('liang_zu')).toBe('夯率 ≥ 95%')
  })

  it('truncates the displayed 夯 percent instead of rounding over a boundary', () => {
    // 474/501 = 94.61% is still 梁圣; rounding would print a 梁祖-looking 95%.
    expect(deriveLiangziState(474, 27)).toBe('liang_sheng')
    expect(formatRatioPercents(474, 27)).toEqual({ up: '94%', down: '6%' })
  })

  it('zero votes render `--` on both sides', () => {
    expect(formatRatioPercents(0, 0)).toEqual({ up: '--', down: '--' })
    expect(formatLiangPosition(0, 0)).toBe('--')
  })

  it('shows 梁位 with six decimals so one vote stays visible as the case grows', () => {
    expect(formatLiangPosition(10_665, 2_181)).toBe('83.021952%')
    // One more 夯 vote must change the printed value.
    expect(formatLiangPosition(10_666, 2_181)).toBe('83.023273%')
    expect(formatLiangPosition(1, 1)).toBe('50.000000%')
    expect(formatLiangPosition(1, 0)).toBe('100.000000%')
    expect(formatLiangPosition(0, 7)).toBe('0.000000%')
  })

  it('still moves at the 6th decimal on a large case (why 6 and not 4)', () => {
    // With a million votes the 4th decimal would be frozen; the 6th is not.
    const before = formatLiangPosition(700_000, 300_000)
    const after = formatLiangPosition(700_001, 300_000)
    expect(before).toBe('70.000000%')
    expect(after).toBe('70.000029%')
    // Four decimals would have printed 70.0000% both times.
    expect(formatLiangPosition(700_000, 300_000, 4)).toBe(formatLiangPosition(700_001, 300_000, 4))
  })

  it('truncates 梁位 at six decimals too (never crosses a threshold)', () => {
    // 474/501 = 94.610778…% stays 梁圣 and must not print a rounded value that
    // reads as having crossed 95%.
    expect(formatLiangPosition(474, 27)).toBe('94.610778%')
    expect(deriveLiangziState(474, 27)).toBe('liang_sheng')
    const nearly = formatLiangPosition(949_999, 50_001)
    expect(nearly).toBe('94.999900%')
    expect(Number(nearly.replace('%', ''))).toBeLessThan(95)
    expect(deriveLiangziState(949_999, 50_001)).toBe('liang_sheng')
  })

  it('keeps the decimal pair summing to exactly 100%', () => {
    for (const [up, down] of [[1, 2], [399, 102], [10_665, 2_181], [7, 0]] as const) {
      const percents = formatRatioPercents(up, down, 6)
      const sum = Number(percents.up.replace('%', '')) + Number(percents.down.replace('%', ''))
      expect(sum).toBeCloseTo(100, 10)
    }
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
    for (const [up, down] of [[1, 2], [399, 102], [10_665, 2_181], [7, 0]] as const) {
      const percents = formatRatioPercents(up, down)
      const sum = Number(percents.up.replace('%', '')) + Number(percents.down.replace('%', ''))
      expect(sum).toBe(100)
    }
  })
})

describe('threshold policy validation', () => {
  it('accepts the frozen default', () => {
    expect(() => assertValidThresholdPolicy({ boundaries: [0.5, 0.7, 0.85, 0.95] })).not.toThrow()
  })

  it.each([
    [{ boundaries: [0.2, 0.4, 0.6] as unknown as [number, number, number, number] }],
    [{ boundaries: [0.2, 0.2, 0.6, 0.8] as [number, number, number, number] }],
    [{ boundaries: [0.8, 0.6, 0.4, 0.2] as [number, number, number, number] }],
    [{ boundaries: [0, 0.4, 0.6, 0.8] as [number, number, number, number] }],
    [{ boundaries: [0.2, 0.4, 0.6, 1] as [number, number, number, number] }],
    [{ boundaries: [0.2, Number.NaN, 0.6, 0.8] as [number, number, number, number] }],
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
