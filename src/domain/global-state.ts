/**
 * GlobalLiangState — raw accepted-vote aggregate and the published snapshot.
 *
 * The snapshot bundles ratios AND the derived Liangzi state under one
 * `sequence`, so a renderer can never mix an old percentage with a new state
 * (frozen snapshot-consistency rule, AGENTS.md §12).
 */
import { DomainError, assertCount } from './errors.ts'
import {
  DEFAULT_LIANGZI_THRESHOLDS,
  deriveLiangziState,
  type LiangziState,
  type LiangziThresholdPolicy,
} from './liangzi.ts'
import type { VoteType } from './vote.ts'

/** Raw accepted-vote aggregate, updated transactionally per accepted vote. */
export interface GlobalVoteAggregate {
  upVotes: number
  downVotes: number
  /** Users with >= 1 accepted vote for the current case. */
  uniqueVoters: number
}

export const EMPTY_GLOBAL_AGGREGATE: GlobalVoteAggregate = {
  upVotes: 0,
  downVotes: 0,
  uniqueVoters: 0,
}

/** One published, internally consistent global snapshot. */
export interface PublicLiangSnapshot {
  caseId: string
  upVotes: number
  downVotes: number
  /** 香火: total accepted votes = upVotes + downVotes. */
  totalIncense: number
  /** 香客: unique voters. */
  uniqueVoters: number
  /** null when totalIncense === 0 (never a fake 50/50). */
  upRatio: number | null
  downRatio: number | null
  liangziState: LiangziState
  /** Epoch milliseconds at capture. */
  capturedAt: number
  /** Monotonic snapshot version; ratios + state always share one sequence. */
  sequence: number
}

export function assertValidAggregate(aggregate: GlobalVoteAggregate): void {
  assertCount(aggregate.upVotes, 'invalid_vote_count', 'upVotes')
  assertCount(aggregate.downVotes, 'invalid_vote_count', 'downVotes')
  assertCount(aggregate.uniqueVoters, 'invalid_vote_count', 'uniqueVoters')
  if (aggregate.uniqueVoters > aggregate.upVotes + aggregate.downVotes) {
    throw new DomainError('invalid_vote_count', 'uniqueVoters cannot exceed total accepted votes')
  }
}

/** Apply one accepted vote to the raw aggregate (pure). */
export function applyAcceptedVote(
  aggregate: GlobalVoteAggregate,
  voteType: VoteType,
  isFirstAcceptedVoteByVoter: boolean,
): GlobalVoteAggregate {
  assertValidAggregate(aggregate)
  return {
    upVotes: aggregate.upVotes + (voteType === 'up' ? 1 : 0),
    downVotes: aggregate.downVotes + (voteType === 'down' ? 1 : 0),
    uniqueVoters: aggregate.uniqueVoters + (isFirstAcceptedVoteByVoter ? 1 : 0),
  }
}

export interface SnapshotBuildInput {
  caseId: string
  aggregate: GlobalVoteAggregate
  capturedAt: number
  sequence: number
  policy?: LiangziThresholdPolicy
}

/** Capture the aggregate into a published snapshot (ratios + state together). */
export function buildPublicSnapshot(input: SnapshotBuildInput): PublicLiangSnapshot {
  assertValidAggregate(input.aggregate)
  assertCount(input.sequence, 'invalid_vote_count', 'sequence')
  if (!Number.isFinite(input.capturedAt)) {
    throw new DomainError('invalid_vote_count', `capturedAt must be finite, got ${String(input.capturedAt)}`)
  }
  const { upVotes, downVotes, uniqueVoters } = input.aggregate
  const totalIncense = upVotes + downVotes
  const policy = input.policy ?? DEFAULT_LIANGZI_THRESHOLDS
  return {
    caseId: input.caseId,
    upVotes,
    downVotes,
    totalIncense,
    uniqueVoters,
    upRatio: totalIncense === 0 ? null : upVotes / totalIncense,
    downRatio: totalIncense === 0 ? null : downVotes / totalIncense,
    liangziState: deriveLiangziState(upVotes, downVotes, policy),
    capturedAt: input.capturedAt,
    sequence: input.sequence,
  }
}
