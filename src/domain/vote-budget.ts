/**
 * Community vote budget: 50 incense per minute, accumulating while idle,
 * hard-capped at 10 minutes (500). One dump request spends as many sticks
 * as `min(requested, remaining, available)` inside a single transaction.
 */
import { DomainError, assertCount } from './errors.ts'
import { VOTE_COUNT_MAX, VOTE_COUNT_MIN } from './vote.ts'

export const VOTE_REFILL_PER_MINUTE = 50
export const VOTE_BUDGET_WINDOW_MS = 60_000
export const VOTE_BURST_MINUTES = 10
export const VOTE_BURST_CAP = VOTE_REFILL_PER_MINUTE * VOTE_BURST_MINUTES

export function voteBurstCap(refillPerMinute: number): number {
  if (refillPerMinute <= 0) return 0
  return refillPerMinute * VOTE_BURST_MINUTES
}

/** How many incense sticks a bucket can spend right now. */
export function voteBudgetAvailable(
  tokens: number,
  updatedAt: number,
  now: number,
  refillPerMinute = VOTE_REFILL_PER_MINUTE,
): number {
  if (refillPerMinute <= 0) return Number.POSITIVE_INFINITY
  const cap = voteBurstCap(refillPerMinute)
  const elapsed = Math.max(0, now - updatedAt)
  return Math.min(cap, tokens + (elapsed / VOTE_BUDGET_WINDOW_MS) * refillPerMinute)
}

/**
 * Authority-side clamp. The client may send remaining incense; the server
 * decides the real spend. Returns 0 when nothing can be taken.
 */
export function clampVoteSpend(
  requested: number,
  remaining: number,
  available: number,
): number {
  assertCount(remaining, 'invalid_incense_count', 'remaining')
  if (!Number.isFinite(requested) || requested < VOTE_COUNT_MIN) {
    throw new DomainError('invalid_incense_count', `requested spend must be >= ${VOTE_COUNT_MIN}`)
  }
  const want = Math.min(Math.floor(requested), VOTE_COUNT_MAX)
  const room = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : want
  return Math.max(0, Math.min(want, remaining, room))
}
