/**
 * Confirmed progress geometry: smooth only between known values, no prediction.
 */
import { describe, expect, it } from 'vitest'
import {
  deriveDisplayedProgress,
  shouldSnapThrottle,
} from '../src/client/use-throttle-fill.ts'

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

describe('shouldSnapThrottle', () => {
  it('snaps first hydration jumps that cross an incense boundary', () => {
    expect(shouldSnapThrottle(0, 0, 3_514_120, 50_000)).toBe(true)
  })

  it('keeps the presentation tween for small forward deltas', () => {
    expect(shouldSnapThrottle(10_000, 10_000, 25_000, 50_000)).toBe(false)
  })

  it('snaps backward reconciliation instead of animating stale progress', () => {
    expect(shouldSnapThrottle(90_000, 90_000, 40_000, 50_000)).toBe(true)
  })
})
