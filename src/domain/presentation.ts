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

/** Percent strings rendered next to the central 梁子 (`--` while WAITING). */
export interface RatioPercentPair {
  up: string
  down: string
}

export const WAITING_PERCENT_TEXT = '--'

/**
 * Format the displayed 夯/拉 percentages from the SAME raw counts the Liangzi
 * state is derived from.
 *
 * The up percent truncates instead of rounding: rounding could print `90%`
 * while the up ratio is still 89.6% (梁圣), which reads as a broken threshold
 * even though the snapshot is internally consistent. Truncation keeps the
 * printed number on the same side of every whole-percent boundary as the
 * state. The down percent is the complement so the pair always sums to 100%.
 */
export function formatRatioPercents(upVotes: number, downVotes: number): RatioPercentPair {
  assertCount(upVotes, 'invalid_vote_count', 'upVotes')
  assertCount(downVotes, 'invalid_vote_count', 'downVotes')
  const total = upVotes + downVotes
  if (total === 0) return { up: WAITING_PERCENT_TEXT, down: WAITING_PERCENT_TEXT }
  // Integer math: no float drift near the 60/70/80/90 boundaries.
  const upPercent = Math.floor((upVotes * 100) / total)
  return { up: `${upPercent}%`, down: `${100 - upPercent}%` }
}
