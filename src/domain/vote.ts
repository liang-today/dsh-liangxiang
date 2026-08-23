/**
 * Vote vocabulary: strictly binary up(夯)/down(拉), idempotent request IDs,
 * discriminated results. No third option, no ranking, no vote weight.
 */
import { DomainError } from './errors.ts'

export const VOTE_TYPES = ['up', 'down'] as const

export type VoteType = (typeof VOTE_TYPES)[number]

export function isVoteType(value: unknown): value is VoteType {
  return value === 'up' || value === 'down'
}

export function assertVoteType(value: unknown): asserts value is VoteType {
  if (!isVoteType(value)) {
    throw new DomainError('invalid_vote_type', `vote type must be "up" or "down", got ${String(value)}`)
  }
}

/** Client-generated idempotency key: 8–128 chars of [A-Za-z0-9._-]. */
export type RequestId = string

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/

export function isRequestId(value: unknown): value is RequestId {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
}

export function assertRequestId(value: unknown): asserts value is RequestId {
  if (!isRequestId(value)) {
    throw new DomainError('invalid_request_id', 'request id must match [A-Za-z0-9._-]{8,128}')
  }
}

/** One request may dump many sticks; omitted / 1 is a single click. */
export const VOTE_COUNT_MIN = 1
export const VOTE_COUNT_MAX = 500

/** Minimal vote intent — the client never self-reports balances or identity. */
export interface VoteIntent {
  caseId: string
  voteType: VoteType
  requestId: RequestId
  /** Requested sticks; the authority clamps to remaining and the rate budget. */
  count?: number
}

export type VoteRejectionReason =
  | 'insufficient_incense'
  | 'case_not_active'
  | 'stale_case'
  | 'idempotency_conflict'
  | 'invalid_intent'

export type VoteResult =
  | {
    status: 'accepted'
    requestId: RequestId
    voteType: VoteType
    /** Authoritative personal accounting after the spend. */
    usedIncenseToday: number
    remainingIncense: number
    /** Sticks actually spent this accept (1 for a click; N for a dump). */
    spentIncense?: number
  }
  | {
    status: 'rejected'
    requestId: RequestId
    reason: VoteRejectionReason
    message: string
  }
