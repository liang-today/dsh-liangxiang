/**
 * Pure-math coverage for the 油门 presentation layer. The React hook itself is
 * a thin rAF wiring; these functions carry the actual rate estimate and the
 * display derivation, so they are what the tests pin down.
 */
import { describe, expect, it } from 'vitest'
import {
  EXTRAPOLATE_WINDOW_MS,
  deriveDisplayedProgress,
  estimateTokensPerSec,
  extrapolateTokens,
} from '../src/client/use-throttle-fill.ts'

describe('estimateTokensPerSec', () => {
  it('returns 0 with fewer than two recent samples', () => {
    expect(estimateTokensPerSec([], 0)).toBe(0)
    expect(estimateTokensPerSec([{ tokens: 100, atMs: 0 }], 0)).toBe(0)
  })

  it('drops samples older than the extrapolation window', () => {
    const samples = [
      { tokens: 0, atMs: 0 },
      { tokens: 1_000, atMs: EXTRAPOLATE_WINDOW_MS + 1 },
    ]
    expect(estimateTokensPerSec(samples, EXTRAPOLATE_WINDOW_MS + 2)).toBe(0)
  })

  it('measures tokens per second across the newest window', () => {
    const samples = [
      { tokens: 0, atMs: 0 },
      { tokens: 500, atMs: 1_000 },
      { tokens: 1_000, atMs: 2_000 },
    ]
    expect(estimateTokensPerSec(samples, 2_000)).toBe(500)
  })
})

describe('extrapolateTokens', () => {
  it('settles on the newest sample once it ages past the window', () => {
    const samples = [{ tokens: 1_000, atMs: 0 }]
    expect(extrapolateTokens(samples, EXTRAPOLATE_WINDOW_MS + 1))
      .toEqual({ tokens: 1_000, extrapolating: false })
  })

  it('extrapolates forward at the measured rate inside the window', () => {
    const samples = [
      { tokens: 0, atMs: 0 },
      { tokens: 500, atMs: 1_000 },
    ]
    // 1.5s after the newest sample at 500 tokens/s -> +750.
    const result = extrapolateTokens(samples, 2_500)
    expect(result.extrapolating).toBe(true)
    expect(result.tokens).toBeCloseTo(1_250, 5)
  })

  it('does not extrapolate when the rate is zero', () => {
    const samples = [
      { tokens: 100, atMs: 0 },
      { tokens: 100, atMs: 500 },
    ]
    expect(extrapolateTokens(samples, 1_000)).toEqual({ tokens: 100, extrapolating: false })
  })
})

describe('deriveDisplayedProgress', () => {
  it('computes fill and tokens-to-next for token_per_incense = 50,000', () => {
    expect(deriveDisplayedProgress(0, 50_000)).toEqual({ fill: 0, tokensToNext: 50_000 })
    expect(deriveDisplayedProgress(47_000, 50_000)).toEqual({ fill: 47_000 / 50_000, tokensToNext: 3_000 })
    // A full stick was just earned: fill resets, next stick is the full 50k.
    expect(deriveDisplayedProgress(50_000, 50_000)).toEqual({ fill: 0, tokensToNext: 50_000 })
    expect(deriveDisplayedProgress(99_999, 50_000)).toEqual({ fill: 49_999 / 50_000, tokensToNext: 1 })
  })

  it('floors fractional tokens and clamps negatives to zero', () => {
    expect(deriveDisplayedProgress(25_000.9, 50_000)).toEqual({ fill: 25_000 / 50_000, tokensToNext: 25_000 })
    expect(deriveDisplayedProgress(-5, 50_000)).toEqual({ fill: 0, tokensToNext: 50_000 })
  })
})
