/**
 * LiangziStatePolicy — the global side of 梁相.
 *
 * The central 梁子 state is driven ONLY by the global up ratio of accepted
 * votes (AGENTS.md §3). Zero total votes is the WAITING placeholder (待开梁),
 * which is not a sixth tier. Personal tokens/incense never appear here.
 */
import { DomainError, assertCount } from './errors.ts'

export const LIANGZI_STATES = [
  'waiting',
  'liang_gong',
  'liang_zong',
  'liang_shen',
  'liang_sheng',
  'liang_zu',
] as const

export type LiangziState = (typeof LIANGZI_STATES)[number]

/** The five voted states, in ascending up-ratio order (WAITING excluded). */
export const ACTIVE_LIANGZI_STATES = [
  'liang_gong',
  'liang_zong',
  'liang_shen',
  'liang_sheng',
  'liang_zu',
] as const

export type ActiveLiangziState = (typeof ACTIVE_LIANGZI_STATES)[number]

/**
 * Ascending up-ratio boundaries splitting [0,1] into the five active states:
 * `[b0,b1,b2,b3]` maps `<b0`->梁工, `[b0,b1)`->梁总, `[b1,b2)`->梁神,
 * `[b2,b3)`->梁圣, `>=b3`->梁祖. WAITING is handled by totalVotes === 0, not
 * by a boundary.
 */
export interface LiangziThresholdPolicy {
  readonly boundaries: readonly [number, number, number, number]
}

/**
 * Frozen thresholds: the lower half is 梁工; the upper half gets harder
 * toward 梁祖 (50 / 70 / 85 / 95).
 */
export const DEFAULT_LIANGZI_THRESHOLDS: LiangziThresholdPolicy = {
  boundaries: [0.5, 0.7, 0.85, 0.95],
}

/** Validate a threshold policy: four finite, strictly ascending values in (0,1). */
export function assertValidThresholdPolicy(policy: LiangziThresholdPolicy): void {
  const { boundaries } = policy
  if (!Array.isArray(boundaries) || boundaries.length !== 4) {
    throw new DomainError('invalid_policy', 'threshold policy must have exactly 4 boundaries')
  }
  for (const boundary of boundaries) {
    if (typeof boundary !== 'number' || !Number.isFinite(boundary) || boundary <= 0 || boundary >= 1) {
      throw new DomainError('invalid_policy', `threshold boundary out of (0,1): ${String(boundary)}`)
    }
  }
  for (let i = 1; i < boundaries.length; i += 1) {
    // Non-null: length checked above; indexes 0..3 are in range.
    if ((boundaries[i] as number) <= (boundaries[i - 1] as number)) {
      throw new DomainError('invalid_policy', 'threshold boundaries must be strictly ascending (no overlap, no gap)')
    }
  }
}

/** Map a validated up ratio in [0,1] to one of the five active states. */
export function liangziStateForUpRatio(
  upRatio: number,
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): ActiveLiangziState {
  assertValidThresholdPolicy(policy)
  if (typeof upRatio !== 'number' || !Number.isFinite(upRatio) || upRatio < 0 || upRatio > 1) {
    throw new DomainError('invalid_policy', `upRatio out of [0,1]: ${String(upRatio)}`)
  }
  const [b0, b1, b2, b3] = policy.boundaries
  if (upRatio < b0) return 'liang_gong'
  if (upRatio < b1) return 'liang_zong'
  if (upRatio < b2) return 'liang_shen'
  if (upRatio < b3) return 'liang_sheng'
  return 'liang_zu'
}

/** The up-ratio interval `[minInclusive, maxExclusive)` owned by a state. */
export interface LiangziUpRatioBand {
  /** null = open on that side; WAITING has both sides null (no ratio at all). */
  minInclusive: number | null
  maxExclusive: number | null
}

/** The exact up-ratio band of one state under a policy (single source for UI copy). */
export function liangziUpRatioBand(
  state: LiangziState,
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): LiangziUpRatioBand {
  assertValidThresholdPolicy(policy)
  const [b0, b1, b2, b3] = policy.boundaries
  switch (state) {
    case 'waiting': return { minInclusive: null, maxExclusive: null }
    case 'liang_gong': return { minInclusive: null, maxExclusive: b0 }
    case 'liang_zong': return { minInclusive: b0, maxExclusive: b1 }
    case 'liang_shen': return { minInclusive: b1, maxExclusive: b2 }
    case 'liang_sheng': return { minInclusive: b2, maxExclusive: b3 }
    case 'liang_zu': return { minInclusive: b3, maxExclusive: null }
  }
}

/**
 * Derive the Liangzi state from raw accepted vote counts.
 * `0/0` is WAITING; anything else goes through the threshold policy.
 */
export function deriveLiangziState(
  upVotes: number,
  downVotes: number,
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): LiangziState {
  assertCount(upVotes, 'invalid_vote_count', 'upVotes')
  assertCount(downVotes, 'invalid_vote_count', 'downVotes')
  const total = upVotes + downVotes
  if (total === 0) return 'waiting'
  return liangziStateForUpRatio(upVotes / total, policy)
}
