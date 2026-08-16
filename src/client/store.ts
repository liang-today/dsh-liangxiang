/**
 * Client view store: one external snapshot store consumed through
 * `useSyncExternalStore`. This milestone ships the MOCK implementation —
 * domain rules are real, data is seeded. The live host-backed store replaces
 * the seed in the real-token milestone without changing the interface.
 *
 * All business transitions delegate to `domain/`; the store never hand-rolls
 * ratios, thresholds, or incense math.
 */
import {
  applyAcceptedVote,
  buildPublicSnapshot,
  canSpendIncense,
  derivePersonalLiangQiState,
  spendOneIncense,
  type DailyLiangCase,
  type GlobalVoteAggregate,
  type PersonalLiangQiState,
  type PublicLiangSnapshot,
  type VoteResult,
  type VoteType,
} from '../domain/index.ts'

/** Everything the panel renders, in one immutable snapshot. */
export interface LiangbiaoViewState {
  activeCase: DailyLiangCase
  /** Global snapshot: ratios + Liangzi state always share one sequence. */
  snapshot: PublicLiangSnapshot
  /** Personal LiangQi: spendable incense + next-incense progress. */
  personal: PersonalLiangQiState
}

export interface LiangbiaoStore {
  getSnapshot(): LiangbiaoViewState
  subscribe(listener: () => void): () => void
  /** Submit one vote intent; returns the (mock-)authoritative result. */
  vote(voteType: VoteType): VoteResult
}

/** Seed knobs for the mock store (defaults follow the frozen demo numbers). */
export interface MockStoreSeed {
  caseTitle?: string
  upVotes?: number
  downVotes?: number
  uniqueVoters?: number
  effectiveTokensToday?: number
  usedIncenseToday?: number
  tokenPerIncense?: number
}

/** Frozen demo scenario: 83% 夯 (梁圣), personal 5 炷 with 94% ring fill. */
const DEFAULT_SEED: Required<MockStoreSeed> = {
  caseTitle: 'DeepSeek Harness 是夯还是拉',
  upVotes: 10_665,
  downVotes: 2_181,
  uniqueVoters: 2_841,
  effectiveTokensToday: 397_000,
  usedIncenseToday: 2,
  tokenPerIncense: 50_000,
}

export interface MockLiangbiaoStore extends LiangbiaoStore {
  /** Test/dev helper: simulate today's effective tokens growing by `count`. */
  addEffectiveTokens(count: number): void
}

let requestCounter = 0

/** Locally-generated idempotency key for mock intents. */
function nextMockRequestId(): string {
  requestCounter += 1
  return `mock-${Date.now().toString(36)}-${requestCounter.toString(36).padStart(4, '0')}`
}

export function createMockLiangbiaoStore(seed: MockStoreSeed = {}): MockLiangbiaoStore {
  const resolved = { ...DEFAULT_SEED, ...seed }
  const activeCase: DailyLiangCase = {
    id: 'mock-case-001',
    businessDate: '2026-08-16',
    title: resolved.caseTitle,
    status: 'active',
    createdAt: Date.now(),
    tokenPerIncense: resolved.tokenPerIncense,
  }

  let aggregate: GlobalVoteAggregate = {
    upVotes: resolved.upVotes,
    downVotes: resolved.downVotes,
    uniqueVoters: resolved.uniqueVoters,
  }
  let personal: PersonalLiangQiState = derivePersonalLiangQiState({
    effectiveTokensToday: resolved.effectiveTokensToday,
    usedIncenseToday: resolved.usedIncenseToday,
    tokenPerIncense: resolved.tokenPerIncense,
  })
  // The seeded `usedIncenseToday` counts as prior participation.
  let hasAcceptedVote = resolved.usedIncenseToday > 0
  let sequence = 1
  let state: LiangbiaoViewState = {
    activeCase,
    snapshot: buildPublicSnapshot({ caseId: activeCase.id, aggregate, capturedAt: Date.now(), sequence }),
    personal,
  }

  const listeners = new Set<() => void>()
  const publish = (): void => {
    state = {
      activeCase,
      snapshot: buildPublicSnapshot({ caseId: activeCase.id, aggregate, capturedAt: Date.now(), sequence }),
      personal,
    }
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    vote(voteType): VoteResult {
      const requestId = nextMockRequestId()
      if (!canSpendIncense(personal)) {
        return {
          status: 'rejected',
          requestId,
          reason: 'insufficient_incense',
          message: 'no remaining incense',
        }
      }
      // Order matters for the frozen semantics: the spend touches only
      // used/remaining; the global aggregate (and thus the Liangzi state)
      // moves because the accepted vote changed the global ratio.
      personal = spendOneIncense(personal)
      aggregate = applyAcceptedVote(aggregate, voteType, !hasAcceptedVote)
      hasAcceptedVote = true
      sequence += 1
      publish()
      return {
        status: 'accepted',
        requestId,
        voteType,
        usedIncenseToday: personal.usedIncenseToday,
        remainingIncense: personal.remainingIncense,
      }
    },
    addEffectiveTokens(count) {
      personal = derivePersonalLiangQiState({
        effectiveTokensToday: personal.effectiveTokensToday + count,
        usedIncenseToday: personal.usedIncenseToday,
        tokenPerIncense: personal.tokenPerIncense,
      })
      sequence += 1
      publish()
    },
  }
}
