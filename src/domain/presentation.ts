/**
 * Presentation-only helpers. LiangQi intensity is a continuous visual scalar
 * derived from remaining incense — deliberately NOT a named tier (frozen
 * contract: LiangQi has no personal tiers).
 */
import { DomainError, assertCount } from './errors.ts'

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

/** Bob period when the next-incense ring is empty: still (just earned / no progress). */
export const LIANG_QI_FLOAT_PERIOD_STILL = null
/** Slowest bob, just after a new stick starts accumulating. */
export const LIANG_QI_FLOAT_PERIOD_SLOW_MS = 4_800
/** Fastest bob, when the ring is almost full. */
export const LIANG_QI_FLOAT_PERIOD_FAST_MS = 1_100

/**
 * Map next-incense fill (`token_remainder / token_per_incense`) to the
 * figure-only bob period. This is personal Token progress — not remaining
 * incense, not the global 梁位.
 *
 *   fill === 0  → still
 *   fill → 1    → 4.8s … 1.1s
 */
export function liangQiFloatPeriodMs(fill: number): number | null {
  if (typeof fill !== 'number' || !Number.isFinite(fill) || fill < 0) {
    throw new DomainError('invalid_token_count', `liangQiFill must be a finite non-negative number, got ${String(fill)}`)
  }
  const t = Math.min(1, fill)
  if (t === 0) return LIANG_QI_FLOAT_PERIOD_STILL
  return Math.round(
    LIANG_QI_FLOAT_PERIOD_SLOW_MS
    - (LIANG_QI_FLOAT_PERIOD_SLOW_MS - LIANG_QI_FLOAT_PERIOD_FAST_MS) * t,
  )
}

/**
 * Pictorial remaining-incense on the 香火环, QQ-style place value WITHOUT
 * letting a "moon" steal a stick slot: each denomination has its own orbit.
 *
 *   炷 (ones)     0–9
 *   月 (tens)     0–9
 *   日 (hundreds) 0–9
 *   overflow      remaining when ≥ 1000 (glyphs stop; compact numeral takes over)
 */
export interface IncensePlaceValue {
  ones: number
  tens: number
  hundreds: number
  overflow: number
}

export function incensePlaceValue(remainingIncense: number): IncensePlaceValue {
  assertCount(remainingIncense, 'invalid_incense_count', 'remainingIncense')
  if (remainingIncense >= 1_000) {
    return { ones: 0, tens: 0, hundreds: 0, overflow: remainingIncense }
  }
  return {
    ones: remainingIncense % 10,
    tens: Math.floor(remainingIncense / 10) % 10,
    hundreds: Math.floor(remainingIncense / 100) % 10,
    overflow: 0,
  }
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
 * The up percent TRUNCATES instead of rounding: rounding could print `95%`
 * while the up ratio is still 94.6% (梁圣), which reads as a broken threshold
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
  // Integer math on scaled basis points: no float drift near 50/70/85/95.
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

/**
 * Compact count for the Region 2 flanks (remaining incense / tokens-to-next).
 *
 * Everyday stocks stay exact (`0`–`999`). From 1,000 up, fold into K/M/B with
 * one-decimal ROUNDING so both wings stay short even if someone later
 * lowers `token_per_incense` and incense grows faster than the 50K default.
 *
 * Keep one decimal for the whole K/M/B band. Integer K from 10K froze the
 * typical 下一炷 range (`33,421` and `32,880` both read `33K`) while the
 * ring fill still moved — the product loop is that every bit of accumulation
 * must visibly tick the right flank.
 *
 * This is presentation only. 梁位 still truncates — these are counts, not a
 * threshold-crossing public ratio. Screen-reader copy should keep the exact
 * integer; the compact form is for the visible flanks.
 *
 *   9        -> 9
 *   999      -> 999
 *   1,000    -> 1K
 *   1,499    -> 1.5K  (fractionDigits 1, default)
 *   33,421   -> 33.4K
 *   33,421   -> 33K   (fractionDigits 0 — 下一炷 当量, avoids overlapping 梁子)
 */
export function formatCompactCount(n: number, fractionDigits: 0 | 1 = 1): string {
  assertCount(n, 'invalid_token_count', 'compactCount')
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return formatScaled(n, 1_000, 'K', 1_000_000, 'M', fractionDigits)
  if (n < 1_000_000_000) return formatScaled(n, 1_000_000, 'M', 1_000_000_000, 'B', fractionDigits)
  return formatScaled(n, 1_000_000_000, 'B', Number.POSITIVE_INFINITY, '', fractionDigits)
}

/**
 * Chinese compact counts for crowded UI (Region 4, hover titles):
 * exact below 1 万, then 万 / 百万 / 亿.
 */
export function formatZhCompactCount(n: number): string {
  assertCount(n, 'invalid_token_count', 'zhCompactCount')
  if (n < 10_000) return n.toLocaleString('zh-CN')
  if (n < 1_000_000) return formatScaled(n, 10_000, '万', 1_000_000, '百万', 1)
  if (n < 100_000_000) return formatScaled(n, 1_000_000, '百万', 100_000_000, '亿', 1)
  return formatScaled(n, 100_000_000, '亿', Number.POSITIVE_INFINITY, '', 1)
}

function formatScaled(
  n: number,
  unit: number,
  suffix: string,
  nextUnit: number,
  nextSuffix: string,
  fractionDigits: 0 | 1,
): string {
  const factor = 10 ** fractionDigits
  const rounded = Math.round((n / unit) * factor) / factor
  if (nextSuffix !== '' && rounded * unit >= nextUnit) return `1${nextSuffix}`
  return `${trimDecimal(rounded)}${suffix}`
}

function trimDecimal(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
