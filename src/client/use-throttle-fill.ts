/**
 * useThrottleFill — the "油门" presentation layer for personal LiangQi.
 *
 * The wire frame updates per DSH token observation, which is bursty: a whole
 * request's usage can land at once and then go quiet. This hook turns those
 * bursts into a needle that keeps approaching the next incense stick:
 *
 *   1. it tweens the displayed effective tokens toward the newest real sample,
 *      so a burst ramps instead of snapping;
 *   2. while the last real sample is recent it extrapolates the measured rate
 *      forward, so 下一炷 keeps ticking between bursts;
 *   3. it stops a short window after the last real event and settles exactly
 *      on the authoritative value — it never invents incense at rest.
 *
 * Presentation only. It never feeds vote authority: the vote button still
 * reads the authoritative `remainingIncense`, and the left flank / 凝香 /
 * glyphs all keep the authoritative counts. The visible 下一炷 number is an
 * integer compact count (no `≈`, no decimal) so it does not overlap 梁子.
 */
import { useEffect, useReducer, useRef } from 'react'
import type { PersonalLiangQiState } from '../domain/index.ts'

/** Keep extrapolating for this long after the last real usage event. */
export const EXTRAPOLATE_WINDOW_MS = 2_500
/** Exponential tween time constant toward the projected target. */
const TWEEN_TAU_MS = 320
/** Bounded history for the rate estimate. */
const MAX_SAMPLES = 12

export interface UsageSample {
  tokens: number
  atMs: number
}

export interface ThrottledProgress {
  /** Smoothed ring fill (0..1), the same number driving the bob cadence. */
  fill: number
  /** Smoothed tokens-to-next for the visible 下一炷 flank. */
  tokensToNext: number
  /** True while the displayed number is a projection, not the exact count. */
  isEstimated: boolean
}

/**
 * Tokens/second over the newest samples inside the extrapolation window.
 * Returns 0 when there are fewer than two recent samples (no credible rate).
 */
export function estimateTokensPerSec(samples: readonly UsageSample[], nowMs: number): number {
  const recent = samples.filter((sample) => nowMs - sample.atMs <= EXTRAPOLATE_WINDOW_MS)
  if (recent.length < 2) return 0
  const oldest = recent[0]!
  const newest = recent[recent.length - 1]!
  const dtSec = (newest.atMs - oldest.atMs) / 1000
  if (dtSec <= 0) return 0
  return (newest.tokens - oldest.tokens) / dtSec
}

/**
 * Extrapolate the newest sample forward by the measured rate. Returns the
 * settled sample unchanged once it has aged past the window (no invention at
 * rest) or when the rate is zero.
 */
export function extrapolateTokens(
  samples: readonly UsageSample[],
  nowMs: number,
): { tokens: number, extrapolating: boolean } {
  const newest = samples[samples.length - 1]
  if (newest === undefined) return { tokens: 0, extrapolating: false }
  const ageMs = nowMs - newest.atMs
  if (ageMs > EXTRAPOLATE_WINDOW_MS) return { tokens: newest.tokens, extrapolating: false }
  const rate = estimateTokensPerSec(samples, nowMs)
  if (rate <= 0) return { tokens: newest.tokens, extrapolating: false }
  return { tokens: newest.tokens + rate * (ageMs / 1000), extrapolating: true }
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

export function useThrottleFill(
  personal: PersonalLiangQiState,
  reducedMotion: boolean,
): ThrottledProgress {
  const { effectiveTokensToday, tokenPerIncense } = personal
  const samplesRef = useRef<UsageSample[]>([])
  const displayedRef = useRef(effectiveTokensToday)
  const [, force] = useReducer((value: number) => value + 1, 0)

  // Record the newest real sample (dedupe same-value updates).
  useEffect(() => {
    const samples = samplesRef.current
    const last = samples[samples.length - 1]
    if (last === undefined || last.tokens !== effectiveTokensToday) {
      samples.push({ tokens: effectiveTokensToday, atMs: performance.now() })
      while (samples.length > MAX_SAMPLES) samples.shift()
    }
  }, [effectiveTokensToday])

  // rAF loop: tween the displayed value toward the extrapolated target.
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
      const projected = extrapolateTokens(samplesRef.current, nowMs)
      const target = projected.tokens
      const current = displayedRef.current
      const k = 1 - Math.exp(-dt / TWEEN_TAU_MS)
      let next = current + (target - current) * k
      if (Math.abs(next - target) < 0.5) next = target
      displayedRef.current = next
      force()
      // Stop once settled: not extrapolating and the tween has converged.
      if (!projected.extrapolating && Math.abs(next - target) < 0.5) return
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion, effectiveTokensToday])

  const displayed = displayedRef.current
  const progress = deriveDisplayedProgress(displayed, tokenPerIncense)
  return {
    fill: progress.fill,
    tokensToNext: progress.tokensToNext,
    isEstimated: !reducedMotion && Math.abs(displayed - effectiveTokensToday) >= 1,
  }
}
