/**
 * FakeAuthoritativeLiangService — the LOCAL DEV/TEST stand-in for the future
 * Liangxiang backend (Decision Gate A = A3, docs/043: production trusted
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
  applyAcceptedVotes,
  clampVoteSpend,
  canSpendIncense,
  VOTE_REFILL_PER_MINUTE,
  computeEffectiveTokens,
  deriveArchiveResult,
  derivePersonalLiangQiState,
  EMPTY_GLOBAL_AGGREGATE,
  isoWeekFor,
  LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
  monthFor,
  sumDayArchives,
  type DailyLiangCase,
  type GlobalVoteAggregate,
  type LiangDayArchive,
  type LiangMonthArchive,
  type PersonalLiangQiState,
  type LiangWeekArchive,
  voteBudgetAvailable,
  type VoteResult,
} from '../domain/index.ts'
import type { LiangxiangWireState, WireGlobalCounts, WireVoteRequest } from '../shared/wire.ts'
import { WIRE_SCHEMA_VERSION } from '../shared/wire.ts'
import { createBusinessDateProvider, type BusinessDateProvider, type Clock } from '../shared/business-date.ts'
import { BackendClientError } from './backend-client.ts'
import { DEV_CREDIT_SESSION_ID } from './dev-credit.ts'
import { localCaseId, LOCAL_CASE_TITLES, nextLocalCaseIndex } from './local-cases.ts'
import { LIANGZI_POLICY_VERSION } from '../shared/backend-v1.ts'
import { historyArchiveToV1, type V1HistoryResponse } from '../shared/history-v1.ts'
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
  spentIncense?: number
  /** Original requested count (`count ?? 1`); used for idempotency conflicts. */
  requestedCount?: number
}

/** Everything the persistence adapter loads back at boot. */
export interface LiangPersistedState {
  watermarks: Map<string, SessionUsageWatermark>
  dailyUsage: Map<string, DailyUsageRecord>
  ledgers: Map<string, { usedIncense: number }>
  aggregates: Map<string, GlobalVoteAggregate>
  votes: Map<string, PersistedVoteRecord>
  caseIndexes: Map<string, { caseIndex: number }>
  dayArchives: Map<string, LiangDayArchive>
  weekArchives: Map<string, LiangWeekArchive>
  monthArchives: Map<string, LiangMonthArchive>
}

/** Write-behind persistence port (implemented over the DSH storage domain). */
export interface LiangPersistencePort {
  load(): Promise<LiangPersistedState>
  /** Wait until every previously queued local-domain write is durable. */
  flush(): Promise<void>
  putWatermark(sessionId: string, watermark: SessionUsageWatermark): void
  putDailyUsage(businessDate: string, record: DailyUsageRecord): void
  putLedger(businessDate: string, record: { usedIncense: number }): void
  putAggregate(caseId: string, aggregate: GlobalVoteAggregate): void
  putVote(requestId: string, record: PersistedVoteRecord): void
  putCaseIndex(businessDate: string, record: { caseIndex: number }): void
  putDayArchive(businessDate: string, archive: LiangDayArchive): void
  putWeekArchive(weekId: string, archive: LiangWeekArchive): void
  putMonthArchive(monthId: string, archive: LiangMonthArchive): void
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
  /** Startup observations in arrival order (catch-up must baseline before live). */
  private readonly pendingObservations: Array<{
    sessionId: string
    value: unknown
    origin: UsageObservationOrigin
    modelId: string | null | undefined
  }> = []

  private watermarks = new Map<string, SessionUsageWatermark>()
  private dailyUsage = new Map<string, DailyUsageRecord>()
  private ledgers = new Map<string, { usedIncense: number }>()
  private aggregates = new Map<string, GlobalVoteAggregate>()
  private votes = new Map<string, PersistedVoteRecord>()
  private caseIndexes = new Map<string, { caseIndex: number }>()
  private dayArchives = new Map<string, LiangDayArchive>()
  private weekArchives = new Map<string, LiangWeekArchive>()
  private monthArchives = new Map<string, LiangMonthArchive>()
  private archiveVersion = 0

  private currentDate = ''
  private activeCase!: DailyLiangCase
  private aggregate: GlobalVoteAggregate = EMPTY_GLOBAL_AGGREGATE
  private usedIncenseToday = 0
  /** Local incense token bucket: same 50/min, cap 500 as the community backend. */
  private voteBucketTokens = VOTE_REFILL_PER_MINUTE
  private voteBucketUpdatedAt = 0

  private published!: WireGlobalCounts
  private snapshotSequence = 0
  private localCaseIndex = 0

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
    for (const [sessionId, persistedMark] of persisted.watermarks) {
      const current = this.watermarks.get(sessionId)
      this.watermarks.set(sessionId, current === undefined
        ? { ...persistedMark }
        : {
          inputHwm: Math.max(current.inputHwm, persistedMark.inputHwm),
          outputHwm: Math.max(current.outputHwm, persistedMark.outputHwm),
        })
    }
    for (const [date, persistedDay] of persisted.dailyUsage) {
      const current = this.dailyUsage.get(date)
      this.dailyUsage.set(date, current === undefined
        ? { ...persistedDay }
        : {
          inputTokens: Math.max(current.inputTokens, persistedDay.inputTokens),
          outputTokens: Math.max(current.outputTokens, persistedDay.outputTokens),
          weightCarry: Math.max(current.weightCarry, persistedDay.weightCarry),
          observedAt: Math.max(current.observedAt, persistedDay.observedAt),
        })
    }
    if (!this.ready) {
      this.ledgers = persisted.ledgers
      this.aggregates = persisted.aggregates
      this.votes = persisted.votes
      this.caseIndexes = persisted.caseIndexes
      this.dayArchives = persisted.dayArchives
      this.weekArchives = persisted.weekArchives
      this.monthArchives = persisted.monthArchives
    }
    this.archiveVersion = Math.max(
      0,
      ...[...this.dayArchives.values(), ...this.weekArchives.values(), ...this.monthArchives.values()]
        .map(archive => archive.archiveVersion),
    )
    this.persistence = port
    this.currentDate = '' // force re-rotation against hydrated maps
    this.rotateToCurrentDate()
    this.markReady('persistence attached')
  }

  /** Bounded fallback when no storage domain shows up (memory-only mode). */
  markReadyMemoryOnly(reason: string): void {
    if (this.ready) return
    this.warn(`[dsh-liangxiang] running memory-only (no persistence): ${reason}`)
    this.markReady(reason)
  }

  private markReady(_reason: string): void {
    if (this.ready) return
    this.ready = true
    const pending = this.pendingObservations.splice(0)
    for (const entry of pending) {
      this.observeUsage(entry.sessionId, entry.value, entry.origin, entry.modelId)
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
      this.pendingObservations.push({ sessionId, value, origin, modelId })
      return
    }
    if (!isDshTokenUsageBuckets(value)) {
      this.warn(`[dsh-liangxiang] ignoring malformed tokenUsage projection for session ${sessionId}`)
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
  vote(intent: WireVoteRequest): { result: VoteResult, state: LiangxiangWireState } {
    this.rotateToCurrentDate()
    const respond = (result: VoteResult): { result: VoteResult, state: LiangxiangWireState } =>
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
      const requested = intent.count ?? 1
      const originalRequested = existing.requestedCount ?? existing.spentIncense ?? 1
      if (
        existing.caseId === intent.caseId
        && existing.voteType === intent.voteType
        && originalRequested === requested
      ) {
        const current = this.derivePersonal()
        return respond({
          status: 'accepted',
          requestId: intent.requestId,
          voteType: existing.voteType,
          usedIncenseToday: current.usedIncenseToday,
          remainingIncense: current.remainingIncense,
          spentIncense: 0,
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

    const now = this.clock.now()
    const available = this.voteBucketUpdatedAt === 0
      ? VOTE_REFILL_PER_MINUTE
      : Math.floor(voteBudgetAvailable(this.voteBucketTokens, this.voteBucketUpdatedAt, now))
    if (available < 1) {
      throw new BackendClientError('too many vote requests; slow down', 429, 'vote_rate_limited')
    }
    const spent = clampVoteSpend(intent.count ?? 1, personal.remainingIncense, available)
    if (spent < 1) {
      return respond({
        status: 'rejected',
        requestId: intent.requestId,
        reason: 'insufficient_incense',
        message: 'no remaining incense today',
      })
    }

    // Commit (no awaits between the check above and the writes below).
    const firstAcceptedVote = ![...this.votes.values()].some(record => record.caseId === this.activeCase.id)
    this.usedIncenseToday += spent
    this.aggregate = applyAcceptedVotes(this.aggregate, intent.voteType, spent, firstAcceptedVote)
    this.aggregates.set(this.activeCase.id, this.aggregate)
    this.ledgers.set(this.currentDate, { usedIncense: this.usedIncenseToday })
    this.voteBucketTokens = available - spent
    this.voteBucketUpdatedAt = now
    const record: PersistedVoteRecord = {
      caseId: intent.caseId,
      voteType: intent.voteType,
      usedIncenseToday: this.usedIncenseToday,
      remainingIncense: personal.remainingIncense - spent,
      acceptedAt: now,
      spentIncense: spent,
      requestedCount: intent.count ?? 1,
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
      spentIncense: spent,
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
      'deepseek-v4-pro',
    )
  }

  /** Cycle the prepared local 今日梁案 list. Each title keeps its own aggregate. */
  cycleLocalCase(): void {
    this.rotateToCurrentDate()
    this.aggregates.set(this.activeCase.id, this.aggregate)
    this.persistence?.putAggregate(this.activeCase.id, this.aggregate)
    this.localCaseIndex = nextLocalCaseIndex(this.localCaseIndex)
    this.caseIndexes.set(this.currentDate, { caseIndex: this.localCaseIndex })
    this.persistence?.putCaseIndex(this.currentDate, { caseIndex: this.localCaseIndex })
    this.openLocalCase()
    this.publishSnapshot()
  }

  getWireState(): LiangxiangWireState {
    this.rotateToCurrentDate()
    const usage = this.dailyUsage.get(this.currentDate) ?? EMPTY_DAILY_USAGE
    const personal = this.derivePersonal()
    return {
      schemaVersion: WIRE_SCHEMA_VERSION,
      revision: this.revision,
      hostEpoch: this.hostEpoch,
      authorityMode: 'LOCAL_FAKE_DEV',
      authorityAvailable: true,
      authorityReason: null,
      snapshotRefreshSeconds: this.config.snapshotRefreshSeconds,
      businessDate: this.currentDate,
      archiveVersion: this.archiveVersion,
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

  history(afterVersion?: number): V1HistoryResponse {
    this.rotateToCurrentDate()
    if (afterVersion !== undefined && (!Number.isSafeInteger(afterVersion) || afterVersion < 0)) {
      throw new Error('history cursor must be a non-negative safe integer')
    }
    const cursor = afterVersion ?? -1
    return historyArchiveToV1({
      archiveVersion: this.archiveVersion,
      businessDate: this.currentDate,
      businessTimezone: this.config.timezone,
      stale: false,
      days: [...this.dayArchives.values()].filter(row => row.archiveVersion > cursor),
      weeks: [...this.weekArchives.values()].filter(row => row.archiveVersion > cursor),
      months: [...this.monthArchives.values()].filter(row => row.archiveVersion > cursor),
    }, afterVersion === undefined)
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
    if (this.currentDate !== '' && this.currentDate < date) {
      this.aggregates.set(this.activeCase.id, this.aggregate)
      this.persistence?.putAggregate(this.activeCase.id, this.aggregate)
    }
    this.finalizePersistedDaysBefore(date)
    this.currentDate = date
    this.localCaseIndex = this.caseIndexes.get(date)?.caseIndex ?? 0
    if (this.localCaseIndex < 0 || this.localCaseIndex >= LOCAL_CASE_TITLES.length) {
      this.localCaseIndex = 0
    }
    this.caseIndexes.set(date, { caseIndex: this.localCaseIndex })
    this.persistence?.putCaseIndex(date, { caseIndex: this.localCaseIndex })
    this.openLocalCase()
    this.aggregates.set(this.activeCase.id, this.aggregate)
    this.persistence?.putAggregate(this.activeCase.id, this.aggregate)
    this.usedIncenseToday = this.ledgers.get(date)?.usedIncense ?? 0
    // Hydration guard: a ledger without its usage record would violate
    // used <= earned. Clamp loudly rather than dying or inventing tokens.
    const usage = this.dailyUsage.get(date) ?? EMPTY_DAILY_USAGE
    const earned = Math.floor((usage.inputTokens + usage.outputTokens) / this.config.tokenPerIncense)
    if (this.usedIncenseToday > earned) {
      this.warn(`[dsh-liangxiang] persisted used incense (${this.usedIncenseToday}) exceeds earned (${earned}); clamping`)
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

  /** Recover archives after a Host restart that crossed one or more dates. */
  private finalizePersistedDaysBefore(nextDate: string): void {
    const dates = new Set<string>()
    for (const caseId of this.aggregates.keys()) {
      const match = /^local-(\d{4}-\d{2}-\d{2})-\d+$/.exec(caseId)
      if (match?.[1] !== undefined && match[1] < nextDate) dates.add(match[1])
    }
    const version = this.archiveVersion + 1
    let changed = false
    for (const endedDate of [...dates].sort()) {
      changed = this.finalizeLocalDay(endedDate, version) || changed
    }
    changed = this.finalizeCompletedPeriods(nextDate, version) || changed
    if (changed) this.archiveVersion = version
  }

  /** Materialize one immutable local day. Completed periods are handled after all catch-up days. */
  private finalizeLocalDay(endedDate: string, version: number): boolean {
    if (this.dayArchives.has(endedDate)) return false
    const cases = LOCAL_CASE_TITLES.flatMap((title, index) => {
      const aggregate = this.aggregates.get(localCaseId(endedDate, index))
      return aggregate === undefined ? [] : [{ title, aggregate }]
    })
    if (cases.length === 0) return false

    const upVotes = cases.reduce((sum, entry) => sum + entry.aggregate.upVotes, 0)
    const downVotes = cases.reduce((sum, entry) => sum + entry.aggregate.downVotes, 0)
    const dayArchive: LiangDayArchive = {
      businessDate: endedDate,
      caseCount: cases.length,
      caseTitles: cases.map(entry => entry.title),
      finalizedAt: this.clock.now(),
      archiveVersion: version,
      aggregationPolicyVersion: LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
      liangziPolicyVersion: LIANGZI_POLICY_VERSION,
      ...deriveArchiveResult(upVotes, downVotes),
    }
    this.dayArchives.set(endedDate, dayArchive)
    this.persistence?.putDayArchive(endedDate, dayArchive)
    return true
  }

  /** Build week/month archives only after every recoverable day has been materialized. */
  private finalizeCompletedPeriods(nextDate: string, version: number): boolean {
    const allDays = [...this.dayArchives.values()]
    let changed = false
    for (const day of allDays) {
      const week = isoWeekFor(day.businessDate)
      if (week.endDate < nextDate && !this.weekArchives.has(week.weekId)) {
        const covered = allDays.filter(item => item.businessDate >= week.startDate && item.businessDate <= week.endDate)
        const weekArchive: LiangWeekArchive = {
          weekId: week.weekId,
          startDate: week.startDate,
          endDate: week.endDate,
          coveredDays: covered.length,
          finalizedAt: this.clock.now(),
          archiveVersion: version,
          aggregationPolicyVersion: LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
          liangziPolicyVersion: LIANGZI_POLICY_VERSION,
          ...sumDayArchives(covered),
        }
        this.weekArchives.set(week.weekId, weekArchive)
        this.persistence?.putWeekArchive(week.weekId, weekArchive)
        changed = true
      }
      const month = monthFor(day.businessDate)
      if (month.endDate < nextDate && !this.monthArchives.has(month.monthId)) {
        const covered = allDays.filter(item => item.businessDate >= month.startDate && item.businessDate <= month.endDate)
        const monthArchive: LiangMonthArchive = {
          monthId: month.monthId,
          startDate: month.startDate,
          endDate: month.endDate,
          coveredDays: covered.length,
          finalizedAt: this.clock.now(),
          archiveVersion: version,
          aggregationPolicyVersion: LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
          liangziPolicyVersion: LIANGZI_POLICY_VERSION,
          ...sumDayArchives(covered),
        }
        this.monthArchives.set(month.monthId, monthArchive)
        this.persistence?.putMonthArchive(month.monthId, monthArchive)
        changed = true
      }
    }
    return changed
  }

  private openLocalCase(): void {
    const title = LOCAL_CASE_TITLES[this.localCaseIndex] ?? this.config.caseTitle
    this.activeCase = {
      id: localCaseId(this.currentDate, this.localCaseIndex),
      businessDate: this.currentDate,
      title,
      status: 'active',
      createdAt: this.clock.now(),
      tokenPerIncense: this.config.tokenPerIncense,
    }
    this.aggregate = this.aggregates.get(this.activeCase.id)
      ?? (this.config.seed === 'demo' && this.localCaseIndex === 0 ? DEMO_SEED : EMPTY_GLOBAL_AGGREGATE)
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
        this.warn(`[dsh-liangxiang] state listener failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
