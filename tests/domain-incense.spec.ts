/**
 * P0 personal incense pool: earned/used/remaining invariants, spend
 * semantics (intensity may drop, ring fill must not), shared up/down pool.
 */
import { describe, expect, it } from 'vitest'
import {
  DomainError,
  canSpendIncense,
  derivePersonalLiangQiState,
  liangQiIntensity,
  spendIncense,
  spendOneIncense,
} from '../src/domain/index.ts'

describe('personal inventory', () => {
  it('earned 7 / used 2 -> remaining 5 (frozen demo)', () => {
    const state = derivePersonalLiangQiState({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    expect(state.earnedIncenseToday).toBe(7)
    expect(state.remainingIncense).toBe(5)
    expect(state.tokenRemainder).toBe(47_000)
    expect(state.tokensToNextIncense).toBe(3_000)
    expect(state.liangQiFill).toBeCloseTo(0.94, 10)
  })

  it('one spend moves only used/remaining; remainder, fill, toNext are invariant', () => {
    const before = derivePersonalLiangQiState({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    const after = spendOneIncense(before)
    expect(after.usedIncenseToday).toBe(3)
    expect(after.remainingIncense).toBe(4)
    expect(after.tokenRemainder).toBe(before.tokenRemainder)
    expect(after.liangQiFill).toBe(before.liangQiFill)
    expect(after.tokensToNextIncense).toBe(before.tokensToNextIncense)
    expect(after.effectiveTokensToday).toBe(before.effectiveTokensToday)
  })

  it('earned 5 / used 2 -> remaining 3; one more vote -> used 3 remaining 2', () => {
    const before = derivePersonalLiangQiState({ effectiveTokensToday: 250_000, usedIncenseToday: 2 })
    expect(before.remainingIncense).toBe(3)
    const after = spendOneIncense(before)
    expect(after.usedIncenseToday).toBe(3)
    expect(after.remainingIncense).toBe(2)
  })

  it('spends many sticks in one fold without moving ring fill', () => {
    const before = derivePersonalLiangQiState({ effectiveTokensToday: 500_000, usedIncenseToday: 0 })
    const after = spendIncense(before, 7)
    expect(after.usedIncenseToday).toBe(7)
    expect(after.remainingIncense).toBe(3)
    expect(after.liangQiFill).toBe(before.liangQiFill)
    expect(() => spendIncense(before, 11)).toThrow(DomainError)
  })

  it('allows exactly five spends on five sticks; the sixth fails safe', () => {
    let state = derivePersonalLiangQiState({ effectiveTokensToday: 250_000, usedIncenseToday: 0 })
    for (let i = 0; i < 5; i += 1) {
      expect(canSpendIncense(state)).toBe(true)
      state = spendOneIncense(state)
    }
    expect(state.remainingIncense).toBe(0)
    expect(canSpendIncense(state)).toBe(false)
    expect(() => spendOneIncense(state)).toThrow(DomainError)
    try {
      spendOneIncense(state)
    } catch (error) {
      expect((error as DomainError).code).toBe('insufficient_incense')
    }
  })

  it('rejects used > earned', () => {
    expect(() => derivePersonalLiangQiState({ effectiveTokensToday: 100_000, usedIncenseToday: 3 }))
      .toThrow(DomainError)
    try {
      derivePersonalLiangQiState({ effectiveTokensToday: 100_000, usedIncenseToday: 3 })
    } catch (error) {
      expect((error as DomainError).code).toBe('used_exceeds_earned')
    }
  })

  it('rejects negative / non-integer used counts', () => {
    for (const used of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => derivePersonalLiangQiState({ effectiveTokensToday: 100_000, usedIncenseToday: used }))
        .toThrow(DomainError)
    }
  })
})

describe('LiangQi intensity (presentation scalar, not a tier)', () => {
  it('is 0 with no incense and grows monotonically, bounded by 1', () => {
    expect(liangQiIntensity(0)).toBe(0)
    let previous = 0
    for (const remaining of [1, 3, 5, 10, 12, 50]) {
      const intensity = liangQiIntensity(remaining)
      expect(intensity).toBeGreaterThanOrEqual(previous)
      expect(intensity).toBeLessThanOrEqual(1)
      previous = intensity
    }
    expect(liangQiIntensity(1)).toBeGreaterThan(0)
  })

  it('spending reduces intensity while ring fill stays put', () => {
    const before = derivePersonalLiangQiState({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    const after = spendOneIncense(before)
    expect(liangQiIntensity(after.remainingIncense)).toBeLessThan(liangQiIntensity(before.remainingIncense))
    expect(after.liangQiFill).toBe(before.liangQiFill)
  })

  it('fails safe on invalid input', () => {
    expect(() => liangQiIntensity(-1)).toThrow(DomainError)
    expect(() => liangQiIntensity(Number.NaN)).toThrow(DomainError)
  })
})
