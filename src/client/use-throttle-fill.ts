/**
 * useThrottleFill — the "油门" presentation layer for personal LiangQi.
 *
 * The wire frame updates per DSH token observation, which is bursty: a whole
 * request's usage can land at once and then go quiet. This hook turns those
 * bursts into a needle that keeps approaching the next incense stick:
 *
 * Only ring geometry tweens toward the newest confirmed sample. Numeric
 * captions stay exact; request activity is a separate non-numeric effect.
 *
 * Presentation only. It never feeds vote authority: the vote button still
 * reads the authoritative `remainingIncense`, and the left flank / 凝香 /
 * glyphs all keep the authoritative counts. The visible 下一炷 number is an
 * integer compact count (no `≈`, no decimal) so it does not overlap 梁子.
 */
import { useEffect, useReducer, useRef } from 'react'
import type { PersonalLiangQiState } from '../domain/index.ts'

/** Exponential tween time constant toward the confirmed target. */
const TWEEN_TAU_MS = 320

export interface ThrottledProgress {
  /** Smoothed ring fill (0..1), the same number driving the bob cadence. */
  fill: number
  /** Exact confirmed tokens-to-next for the visible 下一炷 flank. */
  tokensToNext: number
  /** Numeric projections are intentionally disabled. */
  isEstimated: false
}

/**
 * Fill + tokens-to-next for an effective-token count. Deliberately does NOT
 * round-trip through `derivePersonalLiangQiState`: that fold enforces
 * `used <= earned`, which a transient display value (tweening below a spent
 * boundary) can violate and would throw. The display only needs the two
 * progress numbers, so compute them directly.
 */
export function deriveDisplayedProgress(
  effectiveTokens: number,
  tokenPerIncense: number,
): { fill: number, tokensToNext: number } {
  const whole = Math.max(0, Math.floor(effectiveTokens))
  const remainder = whole % tokenPerIncense
  return {
    fill: remainder / tokenPerIncense,
    tokensToNext: tokenPerIncense - remainder,
  }
}

/**
 * A hydration/reconciliation jump spanning a whole incense boundary must not
 * be animated through every intermediate modulo value. That made 下一炷 appear
 * to jump randomly while the first authoritative state was loading. Small
 * forward deltas still receive the intended throttle tween.
 */
export function shouldSnapThrottle(
  displayedTokens: number,
  previousAuthoritativeTokens: number | undefined,
  nextAuthoritativeTokens: number,
  tokenPerIncense: number,
): boolean {
  if (previousAuthoritativeTokens !== undefined && nextAuthoritativeTokens < previousAuthoritativeTokens) return true
  return Math.abs(nextAuthoritativeTokens - displayedTokens) >= tokenPerIncense
}

export function useThrottleFill(
  personal: PersonalLiangQiState,
  reducedMotion: boolean,
): ThrottledProgress {
  const { effectiveTokensToday, tokenPerIncense } = personal
  const previousRef = useRef<number | undefined>(undefined)
  const displayedRef = useRef(effectiveTokensToday)
  const [, force] = useReducer((value: number) => value + 1, 0)

  // Reconciliation/large jumps snap; small confirmed increases still glide.
  useEffect(() => {
    if (shouldSnapThrottle(displayedRef.current, previousRef.current, effectiveTokensToday, tokenPerIncense)) {
      displayedRef.current = effectiveTokensToday
      force()
    }
    previousRef.current = effectiveTokensToday
  }, [effectiveTokensToday, tokenPerIncense])

  // rAF loop: interpolate geometry only, never beyond confirmed usage.
  useEffect(() => {
    if (reducedMotion) {
      displayedRef.current = effectiveTokensToday
      force()
      return undefined
    }
    let raf = 0
    let lastFrame = performance.now()
    const loop = (nowMs: number): void => {
      const dt = Math.min(64, nowMs - lastFrame)
      lastFrame = nowMs
      const target = effectiveTokensToday
      const current = displayedRef.current
      const k = 1 - Math.exp(-dt / TWEEN_TAU_MS)
      let next = current + (target - current) * k
      if (Math.abs(next - target) < 0.5) next = target
      displayedRef.current = next
      force()
      if (Math.abs(next - target) < 0.5) return
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion, effectiveTokensToday, tokenPerIncense])

  const displayed = displayedRef.current
  const progress = deriveDisplayedProgress(displayed, tokenPerIncense)
  return {
    fill: progress.fill,
    tokensToNext: personal.tokensToNextIncense,
    isEstimated: false,
  }
}
