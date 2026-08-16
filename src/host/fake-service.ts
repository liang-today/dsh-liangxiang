/**
 * FakeAuthoritativeLiangService — the LOCAL DEV/TEST stand-in for the future
 * Liangbiao backend (Decision Gate A = A3, docs/043: production trusted
 * voting is BLOCKED; this adapter is honestly named and must never be
 * wrapped/presented as production authority or verified usage voting).
 *
 * It owns, exactly like the future backend would:
 *  - the active DailyLiangCase per business date;
 *  - authoritative-like personal accounting (observed tokens -> earned,
 *    accepted votes -> used/remaining);
 *  - the raw GlobalVoteAggregate (per accepted vote, transactional) and the
 *    low-cadence published snapshot (ratios + Liangzi state share one
 *    sequence by construction);
 *  - the vote idempotency store.
 *
 * Concurrency: `vote()` is fully synchronous between check and commit, so
 * concurrent HTTP requests inside one host process cannot overspend.
 * Persistence is write-behind (fire-and-forget onto the storage domain's
 * write chain) — a lost write can only under-count, never double-spend.
 */
import {
  isDshTokenUsageBuckets,
  normalizeDshTokenUsage,
} from '../compat/dsh/token-usage.ts'
import type { UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'
import {
  applyAcceptedVote,
  canSpendIncense,
  computeEffectiveTokens,
  derivePersonalLiangQiState,
  EMPTY_GLOBAL_AGGREGATE,
  type DailyLiangCase,
  type GlobalVoteAggregate,
  type PersonalLiangQiState,
  type VoteResult,
} from '../domain/index.ts'
import type { LiangbiaoWireState, WireGlobalCounts, WireVoteRequest } from '../shared/wire.ts'
import { WIRE_SCHEMA_VERSION } from '../shared/wire.ts'
import { createBusinessDateProvider, type BusinessDateProvider, type Clock } from '../shared/business-date.ts'
import { DEV_CREDIT_SESSION_ID } from './dev-credit.ts'
import {
  creditObservedUsage,
  EMPTY_DAILY_USAGE,
  foldUsageObservation,
  type DailyUsageRecord,
  type SessionUsageWatermark,
} from './usage-ledger.ts'

export interface LiangServiceConfig {
  timezone: string
  tokenPerIncense: number
  snapshotRefreshSeconds: number
  /** 'empty' boots each case at zero votes (WAITING); 'demo' seeds the frozen demo numbers. */
  seed: 'empty' | 'demo'
  caseTitle: string
}

/** Accepted-vote record kept for idempotency (and persisted). */
export interface PersistedVoteRecord {
  caseId: string
  voteType: WireVoteRequest['voteType']
  usedIncenseToday: number
  remainingIncense: number
  acceptedAt: number
}

/** Everything the persistence adapter loads back at boot. */
export interface LiangPersistedState {
  watermarks: Map<string, SessionUsageWatermark>
  dailyUsage: Map<string, DailyUsageRecord>
  ledgers: Map<string, { usedIncense: number }>
  aggregates: Map<string, GlobalVoteAggregate>
  votes: Map<string, PersistedVoteRecord>
}

/** Write-behind persistence port (implemented over the DSH storage domain). */
export interface LiangPersistencePort {
  load(): Promise<LiangPersistedState>
  putWatermark(sessionId: string, watermark: SessionUsageWatermark): void
  putDailyUsage(businessDate: string, record: DailyUsageRecord): void
  putLedger(businessDate: string, record: { usedIncense: number }): void
  putAggregate(caseId: string, aggregate: GlobalVoteAggregate): void
  putVote(requestId: string, record: PersistedVoteRecord): void
  deleteVote(requestId: string): void
  deleteDailyUsage(businessDate: string): void
}

const DEMO_SEED: GlobalVoteAggregate = { upVotes: 10_665, downVotes: 2_181, uniqueVoters: 2_841 }

export type { UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'

export class FakeAuthoritativeLiangService {
  private readonly config: LiangServiceConfig
  private readonly clock: Clock
  private readonly dates: BusinessDateProvider
  private readonly warn: (message: string) => void

  private persistence: LiangPersistencePort | null = null
  private ready = false
  /** Latest cumulative projection (+origin) per session seen before readiness. */
  private readonly pendingObservations = new Map<string, {
    value: unknown
    origin: UsageObservationOrigin
    modelId: string | null | undefined
  }>()

  private watermarks = new Map<string, SessionUsageWatermark>()
  private dailyUsage = new Map<string, DailyUsageRecord>()
  private ledgers = new Map<string, { usedIncense: number }>()
  private aggregates = new Map<string, GlobalVoteAggregate>()
  private votes = new Map<string, PersistedVoteRecord>()

  private currentDate = ''
  private activeCase!: DailyLiangCase
  private aggregate: GlobalVoteAggregate = EMPTY_GLOBAL_AGGREGATE
  private usedIncenseToday = 0

  private published!: WireGlobalCounts
  private snapshotSequence = 0

  private revision = 0
  private accountingAvailable = false
  private readonly listeners = new Set<() => void>()
  private readonly hostEpoch = Date.now()

  constructor(config: LiangServiceConfig, clock: Clock, warn: (message: string) => void = (message) => console.warn(message)) {
    this.config = config
    this.clock = clock
    this.warn = warn
    this.dates = createBusinessDateProvider(config.timezone)
    this.rotateToCurrentDate()
  }

  get isReady(): boolean {
    return this.ready
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Hydrate from storage, then adopt the port for write-behind persistence. */
  async attachPersistence(port: LiangPersistencePort): Promise<void> {
    const persisted = await port.load()
    this.watermarks = persisted.watermarks
    this.dailyUsage = persisted.dailyUsage
    this.ledgers = persisted.ledgers
    this.aggregates = persisted.aggregates
    this.votes = persisted.votes
    this.persistence = port
    this.currentDate = '' // force re-rotation against hydrated maps
    this.rotateToCurrentDate()
    this.markReady('persistence attached')
  }

  /** Bounded fallback when no storage domain shows up (memory-only mode). */
  markReadyMemoryOnly(reason: string): void {
    if (this.ready) return
    this.warn(`[dsh-liangbiao] running memory-only (no persistence): ${reason}`)
    this.markReady(reason)
  }

  private markReady(_reason: string): void {
    if (this.ready) return
    this.ready = true
    const pending = [...this.pendingObservations.entries()]
    this.pendingObservations.clear()
    for (const [sessionId, entry] of pending) {
      this.observeUsage(sessionId, entry.value, entry.origin, entry.modelId)
    }
    this.bump()
  }

  setAccountingAvailable(available: boolean): void {
    if (this.accountingAvailable === available) return
    this.accountingAvailable = available
    this.bump()
  }

  /**
   * Feed one cumulative `tokenUsage` projection value for one session.
   * Invalid payloads are skipped loudly (incompatible DSH change).
   */
  observeUsage(
    sessionId: string,
    value: unknown,
    origin: UsageObservationOrigin,
    modelId?: string | null,
  ): void {
    if (!this.ready) {
      this.pendingObservations.set(sessionId, { value, origin, modelId })
      return
    }
    if (!isDshTokenUsageBuckets(value)) {
      this.warn(`[dsh-liangbiao] ignoring malformed tokenUsage projection for session ${sessionId}`)
      return
    }
    this.rotateToCurrentDate()
    const cumulative = normalizeDshTokenUsage(value)
    // Unknown-session rule (see UsageObservationOrigin): fresh live sessions
    // credit from zero; catch-up values and borrowed history baseline.
    const previous = this.watermarks.get(sessionId)
      ?? (origin.kind === 'live' && origin.firstLiveSeq === 0
        ? { inputHwm: 0, outputHwm: 0 }
        : undefined)
    const fold = foldUsageObservation(previous, cumulative)
    const watermarkMoved = previous === undefined
      || fold.watermark.inputHwm !== previous.inputHwm
      || fold.watermark.outputHwm !== previous.outputHwm
    if (watermarkMoved) {
      this.watermarks.set(sessionId, fold.watermark)
      this.persistence?.putWatermark(sessionId, fold.watermark)
    }
    if (fold.deltaInput === 0 && fold.deltaOutput === 0) return
    const now = this.clock.now()
    const day = this.dailyUsage.get(this.currentDate) ?? EMPTY_DAILY_USAGE
    const updated = creditObservedUsage(day, fold.deltaInput, fold.deltaOutput, modelId, now)
    this.dailyUsage.set(this.currentDate, updated)
    this.persistence?.putDailyUsage(this.currentDate, updated)
    this.bump()
  }

  /**
   * The vote transaction (synchronous check-and-commit; see module JSDoc).
   */
  vote(intent: WireVoteRequest): { result: VoteResult, state: LiangbiaoWireState } {
    this.rotateToCurrentDate()
    const respond = (result: VoteResult): { result: VoteResult, state: LiangbiaoWireState } =>
      ({ result, state: this.getWireState() })

    if (intent.caseId !== this.activeCase.id) {
      return respond({
        status: 'rejected',
        requestId: intent.requestId,
        reason: 'stale_case',
        message: `case ${intent.caseId} is not the active case`,
      })
    }
    const existing = this.votes.get(intent.requestId)
    if (existing !== undefined) {
      if (existing.caseId === intent.caseId && existing.voteType === intent.voteType) {
        // Idempotent replay: the original business result, no second spend.
        return respond({
          status: 'accepted',
          requestId: intent.requestId,
          voteType: existing.voteType,
          usedIncenseToday: existing.usedIncenseToday,
          remainingIncense: existing.remainingIncense,
        })
      }
      return respond({
        status: 'rejected',
        requestId: intent.requestId,
        reason: 'idempotency_conflict',
        message: 'request id was already used with a different payload',
      })
    }
    const personal = this.derivePersonal()
    if (!canSpendIncense(personal)) {
      return respond({
        status: 'rejected',
        requestId: intent.requestId,
        reason: 'insufficient_incense',
        message: 'no remaining incense today',
      })
    }

    // Commit (no awaits between the check above and the writes below).
    const firstAcceptedVote = this.usedIncenseToday === 0
    this.usedIncenseToday += 1
    this.aggregate = applyAcceptedVote(this.aggregate, intent.voteType, firstAcceptedVote)
    this.aggregates.set(this.activeCase.id, this.aggregate)
    this.ledgers.set(this.currentDate, { usedIncense: this.usedIncenseToday })
    const record: PersistedVoteRecord = {
      caseId: intent.caseId,
      voteType: intent.voteType,
      usedIncenseToday: this.usedIncenseToday,
      remainingIncense: personal.remainingIncense - 1,
      acceptedAt: this.clock.now(),
    }
    this.votes.set(intent.requestId, record)
    this.persistence?.putLedger(this.currentDate, { usedIncense: this.usedIncenseToday })
    this.persistence?.putAggregate(this.activeCase.id, this.aggregate)
    this.persistence?.putVote(intent.requestId, record)
    this.bump()
    // The published snapshot deliberately does NOT move here: the personal
    // spend is immediate, the global ratio waits for the next cadence tick.
    return respond({
      status: 'accepted',
      requestId: intent.requestId,
      voteType: intent.voteType,
      usedIncenseToday: record.usedIncenseToday,
      remainingIncense: record.remainingIncense,
    })
  }

  /** Cadence hook: rollover check + publish when the raw aggregate moved. */
  tick(): void {
    this.rotateToCurrentDate()
    if (
      this.published.upVotes !== this.aggregate.upVotes
      || this.published.downVotes !== this.aggregate.downVotes
      || this.published.uniqueVoters !== this.aggregate.uniqueVoters
      || this.published.caseId !== this.activeCase.id
    ) {
      this.publishSnapshot()
    }
  }

  refreshNow(): void {
    this.rotateToCurrentDate()
    this.bump()
  }

  /** Local fake IS the ledger; there is no server overlay to restore. */
  reconcileNow(): void {
    this.refreshNow()
  }

  /**
   * Pump Pro-equivalent tokens through the same usage fold as a live DSH
   * session, so the panel, 凝香, and bob cadence all move without a model.
   */
  creditSimulatedUsage(deltaEffectiveTokens: number): void {
    if (!Number.isInteger(deltaEffectiveTokens) || deltaEffectiveTokens <= 0) {
      throw new Error('simulated credit must be a positive integer of Pro-equivalent tokens')
    }
    this.rotateToCurrentDate()
    const previous = this.watermarks.get(DEV_CREDIT_SESSION_ID)
    this.observeUsage(
      DEV_CREDIT_SESSION_ID,
      {
        uncachedInputTokens: (previous?.inputHwm ?? 0) + deltaEffectiveTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: previous?.outputHwm ?? 0,
      },
      previous === undefined
        ? { kind: 'live', firstLiveSeq: 0 }
        : { kind: 'live', firstLiveSeq: 1 },
    )
  }

  getWireState(): LiangbiaoWireState {
    this.rotateToCurrentDate()
    const usage = this.dailyUsage.get(this.currentDate) ?? EMPTY_DAILY_USAGE
    const personal = this.derivePersonal()
    return {
      schemaVersion: WIRE_SCHEMA_VERSION,
      revision: this.revision,
      hostEpoch: this.hostEpoch,
      authorityMode: 'LOCAL_FAKE_DEV',
      snapshotRefreshSeconds: this.config.snapshotRefreshSeconds,
      businessDate: this.currentDate,
      activeCase: this.activeCase,
      global: this.published,
      personal: {
        effectiveTokensToday: personal.effectiveTokensToday,
        usedIncenseToday: personal.usedIncenseToday,
        remainingIncense: personal.remainingIncense,
        tokenPerIncense: personal.tokenPerIncense,
      },
      accounting: {
        available: this.accountingAvailable,
        inputTokensToday: usage.inputTokens,
        outputTokensToday: usage.outputTokens,
        observedAt: usage.observedAt === 0 ? null : usage.observedAt,
        notice: null,
      },
    }
  }

  private derivePersonal(): PersonalLiangQiState {
    const usage = this.dailyUsage.get(this.currentDate) ?? EMPTY_DAILY_USAGE
    const effectiveTokensToday = computeEffectiveTokens({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    })
    return derivePersonalLiangQiState({
      effectiveTokensToday,
      usedIncenseToday: this.usedIncenseToday,
      tokenPerIncense: this.config.tokenPerIncense,
    })
  }

  /** Rotate the active case when the business date changed (or at boot/hydrate). */
  private rotateToCurrentDate(): void {
    const date = this.dates.businessDateOf(this.clock.now())
    if (date === this.currentDate) return
    this.currentDate = date
    this.activeCase = {
      id: `local-${date}`,
      businessDate: date,
      title: this.config.caseTitle,
      status: 'active',
      createdAt: this.clock.now(),
      tokenPerIncense: this.config.tokenPerIncense,
    }
    this.aggregate = this.aggregates.get(this.activeCase.id)
      ?? (this.config.seed === 'demo' ? DEMO_SEED : EMPTY_GLOBAL_AGGREGATE)
    this.usedIncenseToday = this.ledgers.get(date)?.usedIncense ?? 0
    // Hydration guard: a ledger without its usage record would violate
    // used <= earned. Clamp loudly rather than dying or inventing tokens.
    const usage = this.dailyUsage.get(date) ?? EMPTY_DAILY_USAGE
    const earned = Math.floor((usage.inputTokens + usage.outputTokens) / this.config.tokenPerIncense)
    if (this.usedIncenseToday > earned) {
      this.warn(`[dsh-liangbiao] persisted used incense (${this.usedIncenseToday}) exceeds earned (${earned}); clamping`)
      this.usedIncenseToday = earned
      this.ledgers.set(date, { usedIncense: earned })
      this.persistence?.putLedger(date, { usedIncense: earned })
    }
    // Yesterday's idempotency records cannot collide with the new case;
    // prune them (stale-case retries are rejected by case id anyway).
    // Deleting the current entry during Map iteration is spec-safe.
    for (const [requestId, record] of this.votes) {
      if (record.caseId !== this.activeCase.id) {
        this.votes.delete(requestId)
        this.persistence?.deleteVote(requestId)
      }
    }
    this.publishSnapshot()
  }

  /** Capture the raw aggregate into a new published snapshot (one sequence). */
  private publishSnapshot(): void {
    this.snapshotSequence += 1
    this.published = {
      caseId: this.activeCase.id,
      upVotes: this.aggregate.upVotes,
      downVotes: this.aggregate.downVotes,
      uniqueVoters: this.aggregate.uniqueVoters,
      capturedAt: this.clock.now(),
      sequence: this.snapshotSequence,
      lifetimeIncense: this.aggregate.upVotes + this.aggregate.downVotes,
      lifetimeVoters: this.aggregate.uniqueVoters,
    }
    this.bump()
  }

  private bump(): void {
    this.revision += 1
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        this.warn(`[dsh-liangbiao] state listener failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
