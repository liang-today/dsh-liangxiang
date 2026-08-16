/**
 * P0 token boundary matrix (docs/032): 50,000 effective tokens = 1 incense,
 * plus the verified DSH bucket mapping and fail-safe validation.
 */
import { describe, expect, it } from 'vitest'
import { normalizeDshTokenUsage } from '../src/compat/dsh/token-usage.ts'
import {
  DEFAULT_TOKEN_PER_INCENSE,
  DomainError,
  computeEffectiveTokens,
  derivePersonalLiangQiState,
} from '../src/domain/index.ts'

describe('token -> incense boundaries (tokenPerIncense = 50,000)', () => {
  const matrix: Array<[tokens: number, earned: number, remainder: number, toNext: number]> = [
    [0, 0, 0, 50_000],
    [49_999, 0, 49_999, 1],
    [50_000, 1, 0, 50_000],
    [99_999, 1, 49_999, 1],
    [100_000, 2, 0, 50_000],
    [397_000, 7, 47_000, 3_000],
    [500_000, 10, 0, 50_000],
    [1_000_000, 20, 0, 50_000],
  ]

  it.each(matrix)('%d tokens -> earned %d, remainder %d, toNext %d', (tokens, earned, remainder, toNext) => {
    const state = derivePersonalLiangQiState({ effectiveTokensToday: tokens, usedIncenseToday: 0 })
    expect(state.earnedIncenseToday).toBe(earned)
    expect(state.tokenRemainder).toBe(remainder)
    expect(state.tokensToNextIncense).toBe(toNext)
    expect(state.liangQiFill).toBeCloseTo(remainder / DEFAULT_TOKEN_PER_INCENSE, 10)
  })

  it('49,999 fill is 99.998%, exact-multiple fill wraps to 0%', () => {
    expect(derivePersonalLiangQiState({ effectiveTokensToday: 49_999, usedIncenseToday: 0 }).liangQiFill)
      .toBeCloseTo(0.99998, 10)
    expect(derivePersonalLiangQiState({ effectiveTokensToday: 50_000, usedIncenseToday: 0 }).liangQiFill).toBe(0)
  })

  it('397,000 tokens is the frozen demo: fill 94%', () => {
    const state = derivePersonalLiangQiState({ effectiveTokensToday: 397_000, usedIncenseToday: 0 })
    expect(state.liangQiFill).toBeCloseTo(0.94, 10)
  })
})

describe('DSH bucket mapping (Input = uncached + cacheRead + cacheWrite)', () => {
  it('folds the frozen fixture into exactly one incense', () => {
    const normalized = normalizeDshTokenUsage({
      uncachedInputTokens: 10_000,
      cacheReadTokens: 20_000,
      cacheWriteTokens: 5_000,
      outputTokens: 15_000,
    })
    expect(normalized.inputTokens).toBe(35_000)
    expect(normalized.outputTokens).toBe(15_000)
    const effective = computeEffectiveTokens(normalized)
    expect(effective).toBe(50_000)
    const state = derivePersonalLiangQiState({ effectiveTokensToday: effective, usedIncenseToday: 0 })
    expect(state.earnedIncenseToday).toBe(1)
    expect(state.tokenRemainder).toBe(0)
    expect(state.tokensToNextIncense).toBe(50_000)
  })

  it('cache buckets carry full weight (no 10% cache-read, no dropped cache-write)', () => {
    const normalized = normalizeDshTokenUsage({
      uncachedInputTokens: 0,
      cacheReadTokens: 40_000,
      cacheWriteTokens: 10_000,
      outputTokens: 0,
    })
    expect(computeEffectiveTokens(normalized)).toBe(50_000)
  })
})

describe('fail-safe validation', () => {
  it.each([
    [-1, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [1.5, 0],
    [0, -5],
    [0, Number.NaN],
  ])('rejects invalid usage (%s, %s)', (inputTokens, outputTokens) => {
    expect(() => computeEffectiveTokens({ inputTokens, outputTokens })).toThrow(DomainError)
  })

  it('rejects unsafe-integer overflow', () => {
    expect(() => computeEffectiveTokens({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 }))
      .toThrow(DomainError)
  })

  it('rejects invalid tokenPerIncense policy values', () => {
    for (const tokenPerIncense of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => derivePersonalLiangQiState({ effectiveTokensToday: 0, usedIncenseToday: 0, tokenPerIncense }))
        .toThrow(DomainError)
    }
  })
})
