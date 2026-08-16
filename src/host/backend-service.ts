/**
 * `BackendLiangService` — the DEV_STAGING_ONLY host half: the online backend is
 * the authority and this service is a caching proxy in front of it.
 *
 * Division of labour:
 *  - the BACKEND owns identity-scoped spend state, idempotency, the aggregate,
 *    the business date and the published snapshot sequence;
 *  - the HOST owns local token observation (a claim, never a proof) and
 *    paints personal LiangQi from that observation immediately; the backend
 *    claim is a background ratchet for spend authority. The host also holds
 *    the installation identity and the browser channel;
 *  - the BROWSER owns nothing but presentation — the wire frame it receives is
 *    the same shape as in local mode, with `authorityMode` telling it which
 *    trust model produced the numbers.
 *
 * The host never invents global state: ratios and Liangzi state always come
 * from one published backend snapshot, and a vote only moves the personal
 * balance until the next snapshot arrives.
 */
import type { UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'
import type { DailyLiangCase, VoteResult } from '../domain/index.ts'
import type {
  V1Bootstrap,
  V1Case,
  V1PersonalState,
  V1Snapshot,
  V1VoteResult,
} from '../shared/backend-v1.ts'
import { createBusinessDateProvider, type Clock } from '../shared/business-date.ts'
import { PLUGIN_PACKAGE_NAME } from '../shared/index.ts'
import { WIRE_SCHEMA_VERSION, type LiangbiaoWireState, type WireVoteRequest } from '../shared/wire.ts'
import { BackendClientError, type BackendClient } from './backend-client.ts'
import { generateCommunityKeypair, type CommunityKeypair } from './community-keys.ts'
import type { LiangHostService, VoteOutcome } from './service.ts'
import { UsageProjection, type UsageProjectionSink } from './usage-projection.ts'
import type { DailyUsageRecord, SessionUsageWatermark } from './usage-ledger.ts'

const CLAIM_DEBOUNCE_MS = 1_000

/**
 * How often (in cadence ticks) the authoritative personal balance is re-read.
 *
 * Votes and claims already return it, but it can also move OUT OF BAND: another
 * tab, another host on the same installation, or a token claim submitted
 * elsewhere. Without this the panel would keep showing a stale 香火 count until
 * the user voted again — the opposite of "multiple tabs converge".
 */
const PERSONAL_REFRESH_EVERY_TICKS = 5

export interface BackendLiangServiceDeps {
  client: BackendClient
  /** Host-local timezone used only to bucket observed tokens. */
  timezone: string
  clock: Clock
  warn?: (message: string) => void
  /** Coalescing window for token claims; tests use 0. */
  claimDebounceMs?: number
  /**
   * Mutable community keypair holder shared with the HTTP client's signer.
   * Production always fills this; unsigned test stacks may leave it null.
   */
  identityRef?: { current: CommunityKeypair | null }
}

export class BackendLiangService implements LiangHostService {
  private readonly client: BackendClient
  private readonly claimDebounceMs: number
  private readonly warn: (message: string) => void
  private readonly usage: UsageProjection
  private readonly identityRef: { current: CommunityKeypair | null }

  private installationId: string | null = null
  private bootstrap: V1Bootstrap | null = null
  private activeCase: V1Case | null = null
  private personal: V1PersonalState | null = null
  private snapshot: V1Snapshot | null = null
  private businessDate = ''

  private accountingAvailable = false
  private revision = 0
  private readonly hostEpoch = Date.now()
  private readonly listeners = new Set<() => void>()

  private claimTimer: ReturnType<typeof setTimeout> | null = null
  private claimInFlight: Promise<void> | null = null
  private lastClaimSent = -1
  /** Latest backend guard notice (absurd claim clamped); null normally. */
  private claimNotice: string | null = null
  /**
   * How much of `locallyObserved` is already represented in `claimed`.
   * After 上达天听 the local daily total resets while claimed stays; new
   * deltas must be added on top, not max()'d against the server watermark.
   */
  private displayBaseline = 0
  private bootstrapping: Promise<void> | null = null
  private ticks = 0
  private disposed = false

  constructor(deps: BackendLiangServiceDeps) {
    this.client = deps.client
    this.claimDebounceMs = deps.claimDebounceMs ?? CLAIM_DEBOUNCE_MS
    this.warn = deps.warn ?? ((message) => console.warn(message))
    this.identityRef = deps.identityRef ?? { current: null }
    this.usage = new UsageProjection({
      dates: createBusinessDateProvider(deps.timezone),
      clock: deps.clock,
      warn: this.warn,
    })
  }

  get isReady(): boolean {
    return this.bootstrap !== null
  }

  /** The pseudonymous installation id in use, once known. */
  get installation(): string | null {
    return this.installationId
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Adopt persisted local observation state (watermarks + daily totals). */
  hydrateUsage(
    watermarks: Map<string, SessionUsageWatermark>,
    daily: Map<string, DailyUsageRecord>,
    sink: UsageProjectionSink,
  ): void {
    this.usage.hydrate(watermarks, daily, sink)
    this.scheduleClaim()
  }

  /**
   * Adopt the community keypair (or a test installation id) and bootstrap.
   * The id is a self-minted installation identifier — NOT an authenticated
   * user (docs/043).
   */
  attachIdentity(installationId: string): void {
    if (this.installationId === installationId) return
    this.installationId = installationId
    void this.refreshBootstrap()
  }

  attachCommunityIdentity(identity: CommunityKeypair): void {
    this.identityRef.current = identity
    this.attachIdentity(identity.installationId)
  }

  markReadyMemoryOnly(reason: string): void {
    if (this.installationId !== null) return
    // No storage domain: mint an ephemeral keypair so signed requests still
    // work, but skip MAC binding — a throwaway id must not occupy the device
    // fingerprint of a later persisted install.
    const ephemeral = generateCommunityKeypair(null)
    this.warn(
      `[${PLUGIN_PACKAGE_NAME}] no persisted installation identity (${reason}); `
      + `using an ephemeral keypair for this process only`,
    )
    this.attachCommunityIdentity(ephemeral)
  }

  setAccountingAvailable(available: boolean): void {
    if (this.accountingAvailable === available) return
    this.accountingAvailable = available
    this.bump()
  }

  observeUsage(
    sessionId: string,
    value: unknown,
    origin: UsageObservationOrigin,
    modelId?: string | null,
  ): void {
    if (!this.usage.observe(sessionId, value, origin, modelId, this.businessDate || undefined)) return
    this.bump()
    this.scheduleClaim()
  }

  /** Cadence hook: pull the published snapshot (and re-bootstrap on rollover). */
  tick(): void {
    this.ticks += 1
    void this.refreshSnapshot()
    if (this.ticks % PERSONAL_REFRESH_EVERY_TICKS === 0) void this.refreshPersonal()
  }

  /** Hover / panel-open: re-bootstrap so the expanded view is not up to ~1s stale. */
  async refreshNow(): Promise<void> {
    await this.refreshBootstrap()
  }

  /**
   * Drop locally observed daily Token totals (keep watermarks + identity) and
   * re-read the backend incense ledger so the panel cannot stay inflated.
   */
  async reconcileNow(): Promise<void> {
    this.usage.discardDailyTotals()
    this.lastClaimSent = -1
    this.displayBaseline = 0
    await this.refreshBootstrap()
  }

  /** Re-read the authoritative personal balance (out-of-band changes). */
  async refreshPersonal(): Promise<void> {
    const installationId = this.installationId
    if (this.disposed || installationId === null || this.bootstrap === null) return
    try {
      const response = await this.client.dailyState(installationId)
      if (response.business_date !== this.businessDate || response.active_case.id !== this.activeCase?.id) {
        await this.refreshBootstrap()
        return
      }
      this.personal = response.authoritative_personal_state
      this.bump()
    } catch (error) {
      this.reportFailure('daily-state', error)
    }
  }

  async vote(intent: WireVoteRequest): Promise<VoteOutcome> {
    const installationId = this.requireIdentity()
    // Flush any unclaimed local usage before the vote: the backend's spend
    // authority is the claim, so a vote must never race ahead of a debounced
    // claim. Otherwise the panel shows incense the backend has not recorded yet
    // and the vote comes back `insufficient_incense` (remaining=0) until 上达天听.
    await this.flushClaim()
    const response = await this.client.vote(installationId, {
      case_id: intent.caseId,
      vote_type: intent.voteType,
      request_id: intent.requestId,
    })
    this.personal = response.authoritative_personal_state
    // The response carries the snapshot the accepted vote published, so 梁位
    // moves on the click. It is still the BACKEND's published row — the host
    // never computes a ratio of its own — and adopting it needs no round trip.
    if (response.global_snapshot.case_id === this.activeCase?.id) {
      this.snapshot = response.global_snapshot
    }
    this.bump()
    if (
      response.result.status === 'rejected'
      && (response.result.reason === 'stale_case' || response.result.reason === 'case_not_active')
    ) {
      // The browser voted on a case the backend has already rotated past.
      await this.refreshBootstrap().catch(() => undefined)
    }
    return { result: toDomainVoteResult(response.result), state: this.getWireState() }
  }

  getWireState(): LiangbiaoWireState {
    const bootstrap = this.bootstrap
    const activeCase = this.activeCase
    const personal = this.personal
    const snapshot = this.snapshot
    if (bootstrap === null || activeCase === null || personal === null || snapshot === null) {
      throw new Error('backend state requested before the first successful bootstrap')
    }
    const usage = this.usage.recordFor(this.businessDate)
    return {
      schemaVersion: WIRE_SCHEMA_VERSION,
      revision: this.revision,
      hostEpoch: this.hostEpoch,
      authorityMode: 'DEV_STAGING_ONLY',
      snapshotRefreshSeconds: bootstrap.snapshot_refresh_seconds,
      businessDate: this.businessDate,
      activeCase: toDomainCase(activeCase),
      global: {
        caseId: snapshot.case_id,
        upVotes: snapshot.up_votes,
        downVotes: snapshot.down_votes,
        uniqueVoters: snapshot.unique_voters,
        capturedAt: snapshot.captured_at,
        sequence: snapshot.sequence,
      },
      personal: {
        // LiangQi is personal and local: Token observation must move 香火 /
        // 梁气 immediately. The backend claim is a background ratchet for
        // spend authority, not the display clock. used incense stays the
        // server ledger so a vote cannot be invented here.
        effectiveTokensToday: displayedEffectiveTokens(
          personal,
          this.usage.effectiveTokensFor(this.businessDate),
          this.displayBaseline,
        ),
        usedIncenseToday: personal.used_incense,
        remainingIncense: personal.remaining_incense,
        tokenPerIncense: personal.token_per_incense,
      },
      accounting: {
        available: this.accountingAvailable,
        inputTokensToday: usage.inputTokens,
        outputTokensToday: usage.outputTokens,
        observedAt: usage.observedAt === 0 ? null : usage.observedAt,
        notice: this.claimNotice,
      },
    }
  }

  /** Fetch policy + case + personal state + snapshot in one round trip. */
  async refreshBootstrap(): Promise<void> {
    const installationId = this.installationId
    if (installationId === null || this.disposed) return
    if (this.bootstrapping !== null) return this.bootstrapping
    const run = (async (): Promise<void> => {
      try {
        const bootstrap = await this.client.bootstrap(installationId)
        this.adoptBootstrap(bootstrap)
        // A fresh business date means the local claim must be re-submitted.
        this.lastClaimSent = -1
        this.scheduleClaim()
      } catch (error) {
        this.reportFailure('bootstrap', error)
      } finally {
        this.bootstrapping = null
      }
    })()
    this.bootstrapping = run
    return run
  }

  async refreshSnapshot(): Promise<void> {
    if (this.disposed || this.installationId === null) return
    if (this.bootstrap === null) {
      await this.refreshBootstrap()
      return
    }
    try {
      const response = await this.client.snapshot()
      if (response.business_date !== this.businessDate || response.active_case.id !== this.activeCase?.id) {
        // Rollover: personal state and case must be re-read together.
        await this.refreshBootstrap()
        return
      }
      this.snapshot = response.global_snapshot
      this.activeCase = response.active_case
      this.bump()
    } catch (error) {
      this.reportFailure('snapshot', error)
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.claimTimer !== null) {
      clearTimeout(this.claimTimer)
      this.claimTimer = null
    }
    this.listeners.clear()
    this.client.dispose()
  }

  private adoptBootstrap(bootstrap: V1Bootstrap): void {
    this.bootstrap = bootstrap
    this.activeCase = bootstrap.active_case
    this.personal = bootstrap.authoritative_personal_state
    this.snapshot = bootstrap.global_snapshot
    this.businessDate = bootstrap.business_date
    this.usage.alignDailyBucket(this.businessDate)
    this.syncDisplayBaselineFromLedger()
    this.bump()
  }

  /**
   * Submit the locally observed daily total as a claim. Debounced: token
   * observations arrive per streamed chunk, the claim is a cheap ratchet.
   */
  private scheduleClaim(): void {
    if (this.disposed || this.installationId === null || this.claimTimer !== null) return
    this.claimTimer = setTimeout(() => {
      this.claimTimer = null
      void this.submitClaim()
    }, this.claimDebounceMs)
    this.claimTimer.unref?.()
  }

  /**
   * Submit any unclaimed local usage right now. The vote path calls this so a
   * vote is evaluated against the newest claim instead of a debounced one.
   */
  private async flushClaim(): Promise<void> {
    if (this.claimTimer !== null) {
      clearTimeout(this.claimTimer)
      this.claimTimer = null
    }
    await this.submitClaim()
  }

  private async submitClaim(): Promise<void> {
    const installationId = this.installationId
    if (this.disposed || installationId === null) return
    // A claim is already running: wait for it, then re-evaluate below so the
    // newest local total is what actually gets submitted (old claimAgain tail).
    if (this.claimInFlight !== null) {
      await this.claimInFlight
    }
    // Claim for the BACKEND's business date: the host must not decide the day.
    const businessDate = this.businessDate === '' ? this.usage.localBusinessDate() : this.businessDate
    const claimed = this.usage.effectiveTokensFor(businessDate)
    if (claimed <= this.lastClaimSent) {
      this.warn(`[${PLUGIN_PACKAGE_NAME}] claim skip: claimed=${claimed} lastClaimSent=${this.lastClaimSent} date=${businessDate}`)
      return
    }
    this.warn(`[${PLUGIN_PACKAGE_NAME}] claim submit: claimed=${claimed} date=${businessDate}`)
    const run = this.claimOnce(installationId, claimed, businessDate)
    this.claimInFlight = run
    try {
      await run
    } finally {
      this.claimInFlight = null
    }
  }

  private async claimOnce(
    installationId: string,
    claimed: number,
    businessDate: string,
  ): Promise<void> {
    try {
      const response = await this.client.submitClaim(installationId, claimed, businessDate)
      this.personal = response.authoritative_personal_state
      this.activeCase = response.active_case
      this.businessDate = response.business_date
      this.claimNotice = response.claim_notice ?? null
      if (response.business_date !== businessDate) {
        // Rollover: our claim raced a day change (the backend ignored a stale
        // date). Reset the claim watermark so today's smaller totals are never
        // skipped by yesterday's larger one — the very bug that made a new day
        // show local incense while the server stayed at 0.
        this.warn(
          `[${PLUGIN_PACKAGE_NAME}] business date changed ${businessDate} -> ${response.business_date}; resetting claim watermark`,
        )
        this.lastClaimSent = -1
      }
      if (response.claim_applied === false) {
        // Server already has more than this local total; do not retry it.
        if (claimed <= this.personal.claimed_effective_tokens) this.lastClaimSent = claimed
      } else {
        this.lastClaimSent = claimed
        this.displayBaseline = Math.min(
          this.usage.effectiveTokensFor(businessDate),
          this.personal.claimed_effective_tokens,
        )
      }
      this.bump()
    } catch (error) {
      this.reportFailure('token-claim', error)
    }
  }

  /**
   * If local daily is behind the server claim (reconcile / new host), treat
   * it as a suffix to add. Otherwise it already includes the claimed amount.
   */
  private syncDisplayBaselineFromLedger(): void {
    const locallyObserved = this.usage.effectiveTokensFor(this.businessDate)
    const claimed = this.personal?.claimed_effective_tokens ?? 0
    this.displayBaseline = claimed > locallyObserved ? 0 : claimed
  }

  private requireIdentity(): string {
    const installationId = this.installationId
    if (installationId === null) {
      throw new BackendClientError('installation id is not available yet')
    }
    return installationId
  }

  private reportFailure(label: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.warn(`[${PLUGIN_PACKAGE_NAME}] backend ${label} failed: ${message}`)
  }

  private bump(): void {
    this.revision += 1
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        this.warn(`[${PLUGIN_PACKAGE_NAME}] state listener failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

function displayedEffectiveTokens(
  personal: V1PersonalState,
  locallyObserved: number,
  displayBaseline: number,
): number {
  // Cover already-spent incense so a brief local/date mismatch cannot emit
  // a wire frame with used > earned.
  const spentFloor = personal.used_incense * personal.token_per_incense
  const unclaimedLocal = Math.max(0, locallyObserved - displayBaseline)
  return Math.max(personal.claimed_effective_tokens + unclaimedLocal, spentFloor)
}

function toDomainCase(row: V1Case): DailyLiangCase {
  return {
    id: row.id,
    businessDate: row.business_date,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    tokenPerIncense: row.token_per_incense,
  }
}

function toDomainVoteResult(result: V1VoteResult): VoteResult {
  if (result.status === 'accepted') {
    return {
      status: 'accepted',
      requestId: result.request_id,
      voteType: result.vote_type,
      usedIncenseToday: result.used_incense,
      remainingIncense: result.remaining_incense,
    }
  }
  return {
    status: 'rejected',
    requestId: result.request_id,
    reason: result.reason,
    message: result.message,
  }
}