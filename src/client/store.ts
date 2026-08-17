/**
 * Client view store vocabulary + the MOCK implementation (tests/demos).
 *
 * The live host-backed store lives in `live-store.ts` and shares the same
 * `LiangbiaoStore` interface. All business transitions delegate to
 * `domain/`; the store never hand-rolls ratios, thresholds, or incense math.
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
import { DEFAULT_CASE_TITLE } from '../shared/index.ts'
import type { AuthorityMode, LiangbiaoWireState } from '../shared/wire.ts'

export type ConnectionState = 'connecting' | 'live' | 'offline'

/** Everything the panel renders, in one immutable snapshot. */
export interface LiangbiaoViewState {
  connection: ConnectionState
  /** False when the host reports the DSH accounting seams are absent. */
  accountingAvailable: boolean
  /** Backend guard notice (e.g. absurd claim clamped); null normally. */
  accountingNotice: string | null
  /**
   * Which trust model produced these numbers. Both shipped modes are soft
   * trust; the panel labels them honestly (AGENTS.md §16).
   */
  authorityMode: AuthorityMode
  activeCase: DailyLiangCase
  /** Global snapshot: ratios + Liangzi state always share one sequence. */
  snapshot: PublicLiangSnapshot
  /** All-time accepted votes (archived cases included). */
  lifetimeIncense: number
  /** All-time unique voters (archived cases included). */
  lifetimeVoters: number
  /** Personal LiangQi: spendable incense + next-incense progress. */
  personal: PersonalLiangQiState
}

export interface LiangbiaoStore {
  getSnapshot(): LiangbiaoViewState
  subscribe(listener: () => void): () => void
  /** Submit one vote intent; resolves with the authoritative-side result. */
  vote(voteType: VoteType): Promise<VoteResult>
}

/** Derive the render state from one validated wire frame (raw counts in, domain invariants out). */
export function wireToViewState(wire: LiangbiaoWireState, connection: ConnectionState): LiangbiaoViewState {
  return {
    connection,
    accountingAvailable: wire.accounting.available,
    accountingNotice: wire.accounting.notice,
    authorityMode: wire.authorityMode,
    activeCase: wire.activeCase,
    snapshot: buildPublicSnapshot({
      caseId: wire.global.caseId,
      aggregate: {
        upVotes: wire.global.upVotes,
        downVotes: wire.global.downVotes,
        uniqueVoters: wire.global.uniqueVoters,
      },
      capturedAt: wire.global.capturedAt,
      sequence: wire.global.sequence,
    }),
    lifetimeIncense: wire.global.lifetimeIncense,
    lifetimeVoters: wire.global.lifetimeVoters,
    personal: (() => {
      // Ring fill / 下一炷 keep the optimistic local effective tokens; the
      // spendable incense (今日香火 / 可投 / vote button) uses the AUTHORITATIVE
      // server ledger so a stale local bucket can never show spendable incense
      // the backend has not recorded.
      const optimistic = derivePersonalLiangQiState({
        effectiveTokensToday: wire.personal.effectiveTokensToday,
        usedIncenseToday: wire.personal.usedIncenseToday,
        tokenPerIncense: wire.personal.tokenPerIncense,
      })
      return {
        ...optimistic,
        remainingIncense: wire.personal.remainingIncense,
        earnedIncenseToday: wire.personal.remainingIncense + wire.personal.usedIncenseToday,
      }
    })(),
  }
}

/**
 * Placeholder state rendered before the first frame / while offline. The
 * date is cosmetic only (placeholder copy), never an eligibility input.
 */
export function createOfflineViewState(connection: ConnectionState): LiangbiaoViewState {
  return {
    connection,
    accountingAvailable: false,
    accountingNotice: null,
    authorityMode: 'LOCAL_FAKE_DEV',
    activeCase: {
      id: 'offline',
      businessDate: new Date().toISOString().slice(0, 10),
      title: '梁案尚未同步',
      status: 'active',
      createdAt: 0,
      tokenPerIncense: 50_000,
    },
    snapshot: buildPublicSnapshot({
      caseId: 'offline',
      aggregate: { upVotes: 0, downVotes: 0, uniqueVoters: 0 },
      capturedAt: 0,
      sequence: 0,
    }),
    lifetimeIncense: 0,
    lifetimeVoters: 0,
    personal: derivePersonalLiangQiState({ effectiveTokensToday: 0, usedIncenseToday: 0 }),
  }
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

/** Frozen demo scenario: 83% 夯 (梁神 under the 50/70/85/95 policy), personal 5 炷 with 94% ring fill. */
const DEFAULT_SEED: Required<MockStoreSeed> = {
  caseTitle: DEFAULT_CASE_TITLE,
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
  const buildState = (): LiangbiaoViewState => ({
    connection: 'live',
    accountingAvailable: true,
    accountingNotice: null,
    authorityMode: 'LOCAL_FAKE_DEV',
    activeCase,
    snapshot: buildPublicSnapshot({ caseId: activeCase.id, aggregate, capturedAt: Date.now(), sequence }),
    lifetimeIncense: aggregate.upVotes + aggregate.downVotes,
    lifetimeVoters: aggregate.uniqueVoters,
    personal,
  })
  let state = buildState()

  const listeners = new Set<() => void>()
  const publish = (): void => {
    state = buildState()
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    vote(voteType): Promise<VoteResult> {
      const requestId = nextMockRequestId()
      if (!canSpendIncense(personal)) {
        return Promise.resolve({
          status: 'rejected',
          requestId,
          reason: 'insufficient_incense',
          message: 'no remaining incense',
        })
      }
      // Order matters for the frozen semantics: the spend touches only
      // used/remaining; the global aggregate (and thus the Liangzi state)
      // moves because the accepted vote changed the global ratio.
      personal = spendOneIncense(personal)
      aggregate = applyAcceptedVote(aggregate, voteType, !hasAcceptedVote)
      hasAcceptedVote = true
      sequence += 1
      publish()
      return Promise.resolve({
        status: 'accepted',
        requestId,
        voteType,
        usedIncenseToday: personal.usedIncenseToday,
        remainingIncense: personal.remainingIncense,
      })
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
