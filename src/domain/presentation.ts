/**
 * Presentation-only helpers. LiangQi intensity is a continuous visual scalar
 * derived from remaining incense — deliberately NOT a named tier (frozen
 * contract: LiangQi has no personal tiers).
 */
import { assertCount } from './errors.ts'

/**
 * Map remaining incense to a bounded visual intensity in [0,1].
 * 0 sticks -> 0 (only the progress ring remains); growth is sqrt-damped so a
 * large stock stays vivid without uncontrolled animation.
 */
export function liangQiIntensity(remainingIncense: number): number {
  assertCount(remainingIncense, 'invalid_incense_count', 'remainingIncense')
  if (remainingIncense === 0) return 0
  return Math.min(1, Math.sqrt(remainingIncense / 12))
}
