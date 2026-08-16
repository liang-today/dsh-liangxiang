/**
 * Compact flank counts: exact below 1,000; K/M/B with rounding above.
 * 梁位 truncation is a different helper — do not reuse that rule here.
 */
import { describe, expect, it } from 'vitest'
import { DomainError, formatCompactCount, incensePlaceValue } from '../src/domain/index.ts'

describe('formatCompactCount', () => {
  it('prints 0–999 exactly (everyday incense and small remainders)', () => {
    expect(formatCompactCount(0)).toBe('0')
    expect(formatCompactCount(9)).toBe('9')
    expect(formatCompactCount(10)).toBe('10')
    expect(formatCompactCount(12)).toBe('12')
    expect(formatCompactCount(999)).toBe('999')
  })

  it('folds thousands into K with rounding (1 decimal below 10K, integer from 10K)', () => {
    expect(formatCompactCount(1_000)).toBe('1K')
    expect(formatCompactCount(1_049)).toBe('1K')
    expect(formatCompactCount(1_050)).toBe('1.1K')
    expect(formatCompactCount(1_499)).toBe('1.5K')
    expect(formatCompactCount(1_500)).toBe('1.5K')
    expect(formatCompactCount(3_000)).toBe('3K')
    expect(formatCompactCount(9_949)).toBe('9.9K')
    expect(formatCompactCount(9_950)).toBe('10K')
    expect(formatCompactCount(10_000)).toBe('10K')
    expect(formatCompactCount(46_935)).toBe('47K')
    expect(formatCompactCount(50_000)).toBe('50K')
    expect(formatCompactCount(999_499)).toBe('999K')
    expect(formatCompactCount(999_500)).toBe('1M')
  })

  it('folds millions and billions the same way (defensive: incense can theoretically explode)', () => {
    expect(formatCompactCount(1_000_000)).toBe('1M')
    expect(formatCompactCount(1_499_999)).toBe('1.5M')
    expect(formatCompactCount(12_400_000)).toBe('12M')
    expect(formatCompactCount(1_000_000_000)).toBe('1B')
  })

  it('keeps every compact form short enough for the 48px flanks', () => {
    const samples = [
      0, 9, 10, 999, 1_000, 1_499, 9_950, 46_935, 50_000, 999_500, 1_500_000, 12_000_000, 1_000_000_000,
    ]
    for (const n of samples) {
      expect(formatCompactCount(n).length).toBeLessThanOrEqual(4)
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
