/**
 * Compact flank counts: exact below 1,000; K/M/B with rounding above.
 * 梁位 truncation is a different helper — do not reuse that rule here.
 */
import { describe, expect, it } from 'vitest'
import {
  DomainError,
  LIANG_QI_FLOAT_PERIOD_FAST_MS,
  LIANG_QI_FLOAT_PERIOD_SLOW_MS,
  formatCompactCount,
  formatZhCompactCount,
  incensePlaceValue,
  liangQiFloatPeriodMs,
} from '../src/domain/index.ts'

describe('formatCompactCount', () => {
  it('prints 0–999 exactly (everyday incense and small remainders)', () => {
    expect(formatCompactCount(0)).toBe('0')
    expect(formatCompactCount(9)).toBe('9')
    expect(formatCompactCount(10)).toBe('10')
    expect(formatCompactCount(12)).toBe('12')
    expect(formatCompactCount(999)).toBe('999')
  })

  it('folds thousands into K with one decimal for the whole K band', () => {
    expect(formatCompactCount(1_000)).toBe('1K')
    expect(formatCompactCount(1_049)).toBe('1K')
    expect(formatCompactCount(1_050)).toBe('1.1K')
    expect(formatCompactCount(1_499)).toBe('1.5K')
    expect(formatCompactCount(1_500)).toBe('1.5K')
    expect(formatCompactCount(3_000)).toBe('3K')
    expect(formatCompactCount(9_949)).toBe('9.9K')
    expect(formatCompactCount(9_950)).toBe('10K')
    expect(formatCompactCount(10_000)).toBe('10K')
    expect(formatCompactCount(33_421)).toBe('33.4K')
    expect(formatCompactCount(33_100)).toBe('33.1K')
    expect(formatCompactCount(46_935)).toBe('46.9K')
    expect(formatCompactCount(50_000)).toBe('50K')
    expect(formatCompactCount(999_949)).toBe('999.9K')
    expect(formatCompactCount(999_950)).toBe('1M')
  })

  it('does not freeze the typical 下一炷 band as a single integer K', () => {
    // Old integer-K from 10K: 33,421 and 32,880 both rendered "33K".
    expect(formatCompactCount(33_421)).not.toBe(formatCompactCount(32_880))
    expect(formatCompactCount(33_421)).toBe('33.4K')
    expect(formatCompactCount(32_880)).toBe('32.9K')
  })

  it('folds millions and billions the same way (defensive: incense can theoretically explode)', () => {
    expect(formatCompactCount(1_000_000)).toBe('1M')
    expect(formatCompactCount(1_499_999)).toBe('1.5M')
    expect(formatCompactCount(12_400_000)).toBe('12.4M')
    expect(formatCompactCount(1_000_000_000)).toBe('1B')
  })

  it('integer 当量 compact has no decimal (narrow flank next to 梁子)', () => {
    expect(formatCompactCount(33_421, 0)).toBe('33K')
    expect(formatCompactCount(33_100, 0)).toBe('33K')
    expect(formatCompactCount(46_935, 0)).toBe('47K')
    expect(formatCompactCount(1_499, 0)).toBe('1K')
    expect(formatCompactCount(1_500, 0)).toBe('2K')
    expect(formatCompactCount(50_000, 0)).toBe('50K')
  })

  it('keeps every compact form short enough for the 48px flanks', () => {
    const samples = [
      0, 9, 10, 999, 1_000, 1_499, 9_950, 33_421, 46_935, 50_000, 999_950, 1_500_000, 12_000_000, 1_000_000_000,
    ]
    for (const n of samples) {
      expect(formatCompactCount(n).length).toBeLessThanOrEqual(6)
    }
  })

  it('rejects non-counts', () => {
    expect(() => formatCompactCount(-1)).toThrow(DomainError)
    expect(() => formatCompactCount(1.5)).toThrow(DomainError)
  })
})

describe('incensePlaceValue', () => {
  it('splits remaining incense onto separate 炷/月/日 orbits', () => {
    expect(incensePlaceValue(0)).toEqual({ ones: 0, tens: 0, hundreds: 0, overflow: 0 })
    expect(incensePlaceValue(9)).toEqual({ ones: 9, tens: 0, hundreds: 0, overflow: 0 })
    expect(incensePlaceValue(10)).toEqual({ ones: 0, tens: 1, hundreds: 0, overflow: 0 })
    expect(incensePlaceValue(23)).toEqual({ ones: 3, tens: 2, hundreds: 0, overflow: 0 })
    expect(incensePlaceValue(105)).toEqual({ ones: 5, tens: 0, hundreds: 1, overflow: 0 })
    expect(incensePlaceValue(100)).toEqual({ ones: 0, tens: 0, hundreds: 1, overflow: 0 })
    expect(incensePlaceValue(999)).toEqual({ ones: 9, tens: 9, hundreds: 9, overflow: 0 })
  })

  it('does not draw 10 moons; 1000+ is a compact overflow instead', () => {
    expect(incensePlaceValue(1_000)).toEqual({ ones: 0, tens: 0, hundreds: 0, overflow: 1_000 })
    expect(incensePlaceValue(1_234)).toEqual({ ones: 0, tens: 0, hundreds: 0, overflow: 1_234 })
  })
})

describe('liangQiFloatPeriodMs', () => {
  it('stays still at fill 0 and speeds up as the next stick fills', () => {
    expect(liangQiFloatPeriodMs(0)).toBe(LIANG_QI_FLOAT_PERIOD_SLOW_MS)
    expect(liangQiFloatPeriodMs(1)).toBe(LIANG_QI_FLOAT_PERIOD_FAST_MS)
    expect(liangQiFloatPeriodMs(0.5)).toBe(
      Math.round((LIANG_QI_FLOAT_PERIOD_SLOW_MS + LIANG_QI_FLOAT_PERIOD_FAST_MS) / 2),
    )
    expect(liangQiFloatPeriodMs(0.01)!).toBeGreaterThan(liangQiFloatPeriodMs(0.94)!)
  })

  it('rejects a non-finite fill', () => {
    expect(() => liangQiFloatPeriodMs(-0.1)).toThrow(DomainError)
    expect(() => liangQiFloatPeriodMs(Number.NaN)).toThrow(DomainError)
  })
})

describe('formatZhCompactCount', () => {
  it('prints below 1 万 with grouping', () => {
    expect(formatZhCompactCount(0)).toBe('0')
    expect(formatZhCompactCount(2_841)).toBe('2,841')
    expect(formatZhCompactCount(9_999)).toBe('9,999')
  })

  it('uses 万 / 百万 / 亿 above that', () => {
    expect(formatZhCompactCount(10_000)).toBe('1万')
    expect(formatZhCompactCount(12_846)).toBe('1.3万')
    expect(formatZhCompactCount(128_500)).toBe('12.9万')
    expect(formatZhCompactCount(1_000_000)).toBe('1百万')
    expect(formatZhCompactCount(1_500_000)).toBe('1.5百万')
    expect(formatZhCompactCount(100_000_000)).toBe('1亿')
  })
})
