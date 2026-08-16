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
 * Decimals shown on the public 梁位 value.
 *
 * Six, not two or four: the number has to keep moving as the case grows. At
 * 10k votes the 4th decimal is the last one that changes, so a busy day would
 * gradually stop reacting to individual votes — exactly the feeling the single
 * value was introduced to fix.
 */
export const LIANG_POSITION_DECIMALS = 6

/**
 * Format the displayed 夯/拉 percentages from the SAME raw counts the Liangzi
 * state is derived from.
 *
 * The up percent TRUNCATES instead of rounding: rounding could print `90%`
 * while the up ratio is still 89.6% (梁圣), which reads as a broken threshold
 * even though the snapshot is internally consistent. Truncation keeps the
 * printed number on the same side of every boundary as the state, at any number
 * of decimals. The down percent is the complement, so the pair always sums to
 * exactly 100%.
 *
 * @param decimals - decimal places; 0 for a compact integer percent.
 */
export function formatRatioPercents(
  upVotes: number,
  downVotes: number,
  decimals = 0,
): RatioPercentPair {
  assertCount(upVotes, 'invalid_vote_count', 'upVotes')
  assertCount(downVotes, 'invalid_vote_count', 'downVotes')
  assertCount(decimals, 'invalid_vote_count', 'decimals')
  const total = upVotes + downVotes
  if (total === 0) return { up: WAITING_PERCENT_TEXT, down: WAITING_PERCENT_TEXT }
  // Integer math on scaled basis points: no float drift near 60/70/80/90.
  const scale = 10 ** decimals
  const scaledUp = Math.floor((upVotes * 100 * scale) / total)
  const format = (scaled: number): string =>
    `${(scaled / scale).toFixed(decimals)}%`
  return { up: format(scaledUp), down: format(100 * scale - scaledUp) }
}

/**
 * The single public number the panel leads with: 梁位 = global 夯 ratio, shown
 * with decimals so every accepted vote is visible. `--` until the first vote
 * (never a fake 50%).
 */
export function formatLiangPosition(
  upVotes: number,
  downVotes: number,
  decimals = LIANG_POSITION_DECIMALS,
): string {
  return formatRatioPercents(upVotes, downVotes, decimals).up
}
