/**
 * The authoritative Liangbiao service (A3 / DEV_STAGING_ONLY).
 *
 * What it IS authoritative for:
 *  - the business date and the single active DailyLiangCase;
 *  - the spend ledger: how many incense sticks an installation has already
 *    spent today, enforced atomically (no overspend, no double-spend, no
 *    per-tab balances);
 *  - request idempotency;
 *  - the global aggregate and the published snapshot sequence.
 *
 * What it is NOT authoritative for (Decision Gate A3, docs/043):
 *  - WHO the caller is. The installation id is a pseudonymous, resettable
 *    identifier, not an authenticated user.
 *  - WHETHER the Token figure is real. `claimed_effective_tokens` is a host
 *    observation the backend cannot verify; it is stored as a monotonic claim
 *    and never presented as verified usage.
 *
 * Both halves matter: the second one is why this build must never be described
 * as secure verified Token voting, and the first one is why the spend rules are
 * still enforced strictly — an unverifiable budget is not an excuse for a
 * sloppy ledger.
 */
import {
  DEFAULT_LIANGZI_THRESHOLDS,
  derivePersonalLiangQiState,
  deriveLiangziState,
  type LiangziThresholdPolicy,
} from '../domain/index.ts'
import {
  BACKEND_SCHEMA_VERSION,
  CLAIM_SOURCE_HOST_OBSERVED,
  LIANGZI_POLICY_VERSION,
  type V1Bootstrap,
  type V1Case,
  type V1PersonalState,
  type V1PersonalStateResponse,
  type V1Snapshot,
  type V1SnapshotResponse,
  type V1TokenClaimRequest,
  type V1VoteRequest,
  type V1VoteResponse,
  type V1VoteResult,
} from '../shared/backend-v1.ts'
import { createBusinessDateProvider, systemClock, type BusinessDateProvider, type Clock } from '../shared/business-date.ts'
import { SNAPSHOT_HISTORY_LIMIT, type BackendConfig } from './config.ts'
import {
  isUniqueConstraintError,
  type BackendStore,
  type CaseRow,
  type IncenseRow,
  type SnapshotRow,
  type StatsRow,
} from './store.ts'

/** Thrown when a concurrent duplicate wins the idempotency race. */
class DuplicateRequestSignal extends Error {}

export interface BackendServiceDeps {
  store: BackendStore
  config: BackendConfig
  clock?: Clock
  warn?: (message: string) => void
}

export class LiangbiaoBackendService {
  private readonly store: BackendStore
  private readonly config: BackendConfig
  private readonly clock: Clock
  private readonly dates: BusinessDateProvider
  private readonly policy: LiangziThresholdPolicy
  private readonly warn: (message: string) => void

  constructor(deps: BackendServiceDeps) {
    this.store = deps.store
    this.config = deps.config
    this.clock = deps.clock ?? systemClock
    this.dates = createBusinessDateProvider(deps.config.timezone)
    this.policy = DEFAULT_LIANGZI_THRESHOLDS
    this.warn = deps.warn ?? ((message) => console.warn(message))
  }

  get authorityMode(): BackendConfig['authorityMode'] {
    return this.config.authorityMode
  }

  /** The authoritative business date (server clock + configured timezone). */
  businessDate(now = this.clock.now()): string {
    return this.dates.businessDateOf(now)
  }

  /**
   * Rotate to today's case, creating it on first contact and closing every
   * still-open earlier case. Yesterday's votes/tokens stay on yesterday's rows,
   * so nothing leaks across the rollover.
   */
  ensureActiveCase(now = this.clock.now()): CaseRow {
    const businessDate = this.businessDate(now)
    const existing = this.store.activeCaseFor(businessDate)
    if (existing !== undefined) return existing
    return this.store.transaction(() => {
      this.store.closeCasesBefore(businessDate, now)
      const raced = this.store.activeCaseFor(businessDate)
      if (raced !== undefined) return raced
      const id = `case-${businessDate}`
      this.store.insertCase({
        id,
        businessDate,
        title: this.config.caseTitle,
        tokenPerIncense: this.config.tokenPerIncense,
        liangziPolicyVersion: LIANGZI_POLICY_VERSION,
        now,
      })
      // Publish the zero-vote snapshot immediately: a new case must render as
      // 待开梁 with `--` ratios from a real sequence, never from a synthetic one.
      this.store.insertSnapshot({
        case_id: id,
        sequence: 1,
        business_date: businessDate,
        up_votes: 0,
        down_votes: 0,
        unique_voters: 0,
        policy_version: LIANGZI_POLICY_VERSION,
        captured_at: now,
      })
      const created = this.store.activeCaseFor(businessDate)
      if (created === undefined) throw new Error('failed to open the daily case')
      return created
    })
  }

  bootstrap(installationId: string, now = this.clock.now()): V1Bootstrap {
    const caseRow = this.ensureActiveCase(now)
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      authority_mode: this.config.authorityMode,
      server_time: now,
      business_date: caseRow.business_date,
      business_timezone: this.dates.timezone,
      snapshot_refresh_seconds: this.config.snapshotRefreshSeconds,
      token_policy: {
        token_per_incense: caseRow.token_per_incense,
        effective_token_formula: 'input_plus_output',
      },
      liangzi_policy: {
        version: LIANGZI_POLICY_VERSION,
        boundaries: [...this.policy.boundaries] as [number, number, number, number],
      },
      active_case: toV1Case(caseRow),
      authoritative_personal_state: this.personalState(installationId, caseRow, now),
      global_snapshot: this.publishedSnapshot(caseRow, now),
    }
  }

  /**
   * Record a host Token claim (staging only). A claim for a different business
   * date is IGNORED rather than misattributed — the host may have bucketed it
   * under its own timezone.
   */
  applyTokenClaim(
    installationId: string,
    claim: V1TokenClaimRequest,
    now = this.clock.now(),
  ): V1PersonalStateResponse {
    const caseRow = this.ensureActiveCase(now)
    let applied = false
    if (claim.claim_business_date === caseRow.business_date) {
      applied = this.store.transaction(() => {
        this.ensureRow(installationId, caseRow, now)
        return this.store.raiseClaim(
          installationId,
          caseRow.business_date,
          claim.claimed_effective_tokens,
          now,
        )
      })
    } else {
      this.warn(
        `[liangbiao-backend] ignoring token claim for ${claim.claim_business_date} `
        + `(authoritative business date is ${caseRow.business_date})`,
      )
    }
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      business_date: caseRow.business_date,
      server_time: now,
      active_case: toV1Case(caseRow),
      authoritative_personal_state: this.personalState(installationId, caseRow, now),
      claim_applied: applied,
    }
  }

  dailyState(installationId: string, now = this.clock.now()): V1PersonalStateResponse {
    const caseRow = this.ensureActiveCase(now)
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      business_date: caseRow.business_date,
      server_time: now,
      active_case: toV1Case(caseRow),
      authoritative_personal_state: this.personalState(installationId, caseRow, now),
    }
  }

  snapshotResponse(now = this.clock.now()): V1SnapshotResponse {
    const caseRow = this.ensureActiveCase(now)
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      server_time: now,
      business_date: caseRow.business_date,
      active_case: toV1Case(caseRow),
      global_snapshot: this.publishedSnapshot(caseRow, now),
    }
  }

  /**
   * The vote transaction: identity + case validation, idempotency, atomic
   * spend, vote record, aggregate update — all inside one `BEGIN IMMEDIATE`.
   *
   * The published global snapshot deliberately does NOT move here; the personal
   * balance is immediate, the public ratio waits for the cadence (AGENTS.md §12).
   */
  vote(installationId: string, intent: V1VoteRequest, now = this.clock.now()): V1VoteResponse {
    const activeCase = this.ensureActiveCase(now)
    let result: V1VoteResult
    try {
      result = this.store.transaction(() => this.voteInTransaction(installationId, intent, activeCase, now))
    } catch (error) {
      if (error instanceof DuplicateRequestSignal) {
        // The concurrent winner already committed; report its outcome verbatim.
        result = this.replayResult(installationId, intent)
      } else {
        throw error
      }
    }
    const caseRow = this.store.caseById(activeCase.id) ?? activeCase
    const snapshot = this.publishedSnapshot(caseRow, now, { publish: false })
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      result,
      authoritative_personal_state: this.personalState(installationId, caseRow, now),
      snapshot_version: { sequence: snapshot.sequence, captured_at: snapshot.captured_at },
    }
  }

  /** Cadence hook (timer): publish a new snapshot when one is due. */
  tick(now = this.clock.now()): void {
    const caseRow = this.ensureActiveCase(now)
    this.publishedSnapshot(caseRow, now)
  }

  private voteInTransaction(
    installationId: string,
    intent: V1VoteRequest,
    activeCase: CaseRow,
    now: number,
  ): V1VoteResult {
    const target = this.store.caseById(intent.case_id)
    if (target === undefined) {
      return rejected(intent, 'stale_case', `case ${intent.case_id} does not exist`)
    }
    if (target.status !== 'active') {
      return rejected(intent, 'case_not_active', `case ${intent.case_id} is closed`)
    }
    if (target.id !== activeCase.id || target.business_date !== activeCase.business_date) {
      return rejected(intent, 'stale_case', `case ${intent.case_id} is not the active case`)
    }

    const existing = this.store.voteByRequestId(installationId, intent.request_id)
    if (existing !== undefined) {
      if (existing.case_id !== intent.case_id || existing.vote_type !== intent.vote_type) {
        return rejected(
          intent,
          'idempotency_conflict',
          'request id was already used with a different payload',
        )
      }
      return {
        status: 'accepted',
        request_id: intent.request_id,
        vote_type: existing.vote_type,
        used_incense: existing.used_incense_after,
        remaining_incense: this.remainingFor(installationId, target),
        replayed: true,
      }
    }

    this.ensureRow(installationId, target, now)
    // Read before the insert: after it, this installation always has a vote.
    const firstVoteForCase = !this.store.hasVotedForCase(installationId, target.id)
    if (!this.store.spendOneIncense(installationId, target.business_date, now)) {
      return rejected(intent, 'insufficient_incense', 'no remaining incense today')
    }
    const row = this.requireRow(installationId, target.business_date)
    const earned = Math.floor(row.claimed_effective_tokens / row.token_per_incense)
    try {
      this.store.insertVote({
        request_id: intent.request_id,
        installation_id: installationId,
        case_id: target.id,
        business_date: target.business_date,
        vote_type: intent.vote_type,
        used_incense_after: row.used_incense,
        remaining_incense_after: earned - row.used_incense,
        created_at: now,
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Roll back this spend: the duplicate is the same business intent.
        throw new DuplicateRequestSignal(intent.request_id)
      }
      throw error
    }
    this.store.applyAcceptedVoteToStats(target.id, intent.vote_type, firstVoteForCase, now)
    return {
      status: 'accepted',
      request_id: intent.request_id,
      vote_type: intent.vote_type,
      used_incense: row.used_incense,
      remaining_incense: earned - row.used_incense,
      replayed: false,
    }
  }

  private replayResult(installationId: string, intent: V1VoteRequest): V1VoteResult {
    const stored = this.store.voteByRequestId(installationId, intent.request_id)
    if (stored === undefined) {
      return rejected(intent, 'invalid_intent', 'vote could not be recorded; retry with the same request id')
    }
    if (stored.case_id !== intent.case_id || stored.vote_type !== intent.vote_type) {
      return rejected(intent, 'idempotency_conflict', 'request id was already used with a different payload')
    }
    const caseRow = this.store.caseById(stored.case_id)
    return {
      status: 'accepted',
      request_id: intent.request_id,
      vote_type: stored.vote_type,
      used_incense: stored.used_incense_after,
      remaining_incense: caseRow === undefined
        ? stored.remaining_incense_after
        : this.remainingFor(installationId, caseRow),
      replayed: true,
    }
  }

  private ensureRow(installationId: string, caseRow: CaseRow, now: number): void {
    this.store.ensureIncenseRow(
      installationId,
      caseRow.business_date,
      caseRow.token_per_incense,
      CLAIM_SOURCE_HOST_OBSERVED,
      now,
    )
  }

  private requireRow(installationId: string, businessDate: string): IncenseRow {
    const row = this.store.incenseFor(installationId, businessDate)
    if (row === undefined) throw new Error('daily incense row vanished mid-transaction')
    return row
  }

  private remainingFor(installationId: string, caseRow: CaseRow): number {
    const row = this.store.incenseFor(installationId, caseRow.business_date)
    if (row === undefined) return 0
    return Math.floor(row.claimed_effective_tokens / row.token_per_incense) - row.used_incense
  }

  private personalState(installationId: string, caseRow: CaseRow, now: number): V1PersonalState {
    const row = this.store.incenseFor(installationId, caseRow.business_date)
    const claimed = row?.claimed_effective_tokens ?? 0
    const used = row?.used_incense ?? 0
    const tokenPerIncense = row?.token_per_incense ?? caseRow.token_per_incense
    // The domain fold is the single source of the accounting identities.
    const personal = derivePersonalLiangQiState({
      effectiveTokensToday: claimed,
      usedIncenseToday: used,
      tokenPerIncense,
    })
    return {
      business_date: caseRow.business_date,
      claimed_effective_tokens: personal.effectiveTokensToday,
      claim_source: CLAIM_SOURCE_HOST_OBSERVED,
      claim_verified: false,
      earned_incense: personal.earnedIncenseToday,
      used_incense: personal.usedIncenseToday,
      remaining_incense: personal.remainingIncense,
      token_remainder: personal.tokenRemainder,
      tokens_to_next_incense: personal.tokensToNextIncense,
      token_per_incense: personal.tokenPerIncense,
      version: row?.version ?? 0,
      updated_at: row?.updated_at ?? now,
    }
  }

  /**
   * The published snapshot for a case, publishing a new sequence when the raw
   * aggregate moved and the cadence elapsed. Ratios and Liangzi state are
   * derived from the one row that is returned, so they always share a version.
   */
  private publishedSnapshot(
    caseRow: CaseRow,
    now: number,
    options: { publish?: boolean } = {},
  ): V1Snapshot {
    const shouldPublish = options.publish ?? true
    const stats = this.statsOf(caseRow)
    let latest = this.store.latestSnapshot(caseRow.id)
    if (shouldPublish && this.isPublishDue(latest, stats, now)) {
      latest = this.publish(caseRow, stats, latest, now)
    }
    const row: SnapshotRow = latest ?? {
      case_id: caseRow.id,
      sequence: 0,
      business_date: caseRow.business_date,
      up_votes: 0,
      down_votes: 0,
      unique_voters: 0,
      policy_version: LIANGZI_POLICY_VERSION,
      captured_at: now,
    }
    return toV1Snapshot(row, this.policy)
  }

  private isPublishDue(latest: SnapshotRow | undefined, stats: StatsRow, now: number): boolean {
    if (latest === undefined) return true
    const moved = latest.up_votes !== stats.up_votes
      || latest.down_votes !== stats.down_votes
      || latest.unique_voters !== stats.unique_voters
    if (!moved) return false
    return now - latest.captured_at >= this.config.snapshotRefreshSeconds * 1000
  }

  private publish(
    caseRow: CaseRow,
    stats: StatsRow,
    latest: SnapshotRow | undefined,
    now: number,
  ): SnapshotRow {
    const row: SnapshotRow = {
      case_id: caseRow.id,
      sequence: (latest?.sequence ?? 0) + 1,
      business_date: caseRow.business_date,
      up_votes: stats.up_votes,
      down_votes: stats.down_votes,
      unique_voters: stats.unique_voters,
      policy_version: LIANGZI_POLICY_VERSION,
      captured_at: now,
    }
    try {
      this.store.transaction(() => {
        this.store.insertSnapshot(row)
        this.store.pruneSnapshots(caseRow.id, SNAPSHOT_HISTORY_LIMIT)
      })
      return row
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Another publisher won the sequence; its row is equally valid.
        return this.store.latestSnapshot(caseRow.id) ?? row
      }
      throw error
    }
  }

  private statsOf(caseRow: CaseRow): StatsRow {
    return this.store.statsFor(caseRow.id) ?? {
      case_id: caseRow.id,
      business_date: caseRow.business_date,
      up_votes: 0,
      down_votes: 0,
      unique_voters: 0,
      version: 0,
      updated_at: 0,
    }
  }
}

function rejected(
  intent: V1VoteRequest,
  reason: Extract<V1VoteResult, { status: 'rejected' }>['reason'],
  message: string,
): V1VoteResult {
  return { status: 'rejected', request_id: intent.request_id, reason, message }
}

function toV1Case(row: CaseRow): V1Case {
  return {
    id: row.id,
    business_date: row.business_date,
    title: row.title,
    status: row.status,
    created_at: row.created_at,
    token_per_incense: row.token_per_incense,
    liangzi_policy_version: row.liangzi_policy_version,
  }
}

/** Derive the public view of one snapshot row (ratios + state, one version). */
export function toV1Snapshot(row: SnapshotRow, policy: LiangziThresholdPolicy): V1Snapshot {
  const totalIncense = row.up_votes + row.down_votes
  return {
    case_id: row.case_id,
    business_date: row.business_date,
    up_votes: row.up_votes,
    down_votes: row.down_votes,
    total_incense: totalIncense,
    unique_voters: row.unique_voters,
    up_ratio: totalIncense === 0 ? null : row.up_votes / totalIncense,
    down_ratio: totalIncense === 0 ? null : row.down_votes / totalIncense,
    liangzi_state: deriveLiangziState(row.up_votes, row.down_votes, policy),
    captured_at: row.captured_at,
    sequence: row.sequence,
    policy_version: row.policy_version,
  }
}
