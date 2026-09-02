/**
 * The authoritative Liangxiang service (A3 / DEV_STAGING_ONLY).
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
import { randomBytes } from 'node:crypto'
import {
  DEFAULT_LIANGZI_THRESHOLDS,
  LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
  addBusinessDays,
  clampVoteSpend,
  deriveArchiveResult,
  derivePersonalLiangQiState,
  deriveLiangziState,
  isBusinessDate,
  isoWeekFor,
  monthFor,
  type LiangziThresholdPolicy,
} from '../domain/index.ts'
import {
  BACKEND_SCHEMA_VERSION,
  BROADCAST_LEVELS,
  BROADCAST_MESSAGE_MAX_LENGTH,
  CLAIM_SOURCE_HOST_OBSERVED,
  isValidBroadcastMessage,
  LIANGZI_POLICY_VERSION,
  parseV1PublishCaseRequest,
  type V1Bootstrap,
  type BroadcastLevel,
  type V1Broadcast,
  type V1AdmissionClaimResponse,
  type V1AdmissionTicketsResponse,
  type V1Case,
  type V1PersonalState,
  type V1PersonalStateResponse,
  type V1PublishCaseResponse,
  type V1RekeyResponse,
  type V1Snapshot,
  type V1SnapshotResponse,
  type V1TokenClaimRequest,
  type V1UnbindResponse,
  type V1VoteRequest,
  type V1VoteResponse,
  type V1VoteResult,
} from '../shared/backend-v1.ts'
import { createBusinessDateProvider, systemClock, type BusinessDateProvider, type Clock } from '../shared/business-date.ts'
import { SNAPSHOT_HISTORY_LIMIT, type BackendConfig } from './config.ts'
import { CASE_BANK, nextCycledCaseTitle } from './case-bank.ts'
import { CommunityAuthError } from './community-auth.ts'
import {
  isUniqueConstraintError,
  type BackendStore,
  type AdmissionInventory,
  type AdmissionTicketRow,
  type CaseRow,
  type MonthArchiveRow,
  type IncenseRow,
  type QueueRow,
  type SnapshotRow,
  type StatsRow,
  type VoteRequestRow,
  type WeekArchiveRow,
} from './store.ts'
import { WireError } from '../shared/wire.ts'
import { historyArchiveToV1, type V1HistoryResponse } from '../shared/history-v1.ts'

/** Thrown when a concurrent duplicate wins the idempotency race. */
class DuplicateRequestSignal extends Error {}

export interface BackendServiceDeps {
  store: BackendStore
  config: BackendConfig
  clock?: Clock
  warn?: (message: string) => void
}

export class LiangxiangBackendService {
  private readonly store: BackendStore
  private readonly config: BackendConfig
  private readonly clock: Clock
  private readonly dates: BusinessDateProvider
  private readonly policy: LiangziThresholdPolicy
  private readonly warn: (message: string) => void
  private archiveCheckedBusinessDate: string | null = null

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

  /** Current low-disruption client notice, or null outside its active window. */
  activeBroadcast(now = this.clock.now()): V1Broadcast | null {
    const row = this.store.activeBroadcast(now)
    if (row === undefined) return null
    return {
      id: row.id,
      level: row.level,
      message: row.message,
      starts_at: row.starts_at,
      expires_at: row.expires_at,
      updated_at: row.updated_at,
    }
  }

  broadcastStatus(): V1Broadcast | null {
    const row = this.store.broadcast()
    if (row === undefined) return null
    return {
      id: row.id,
      level: row.level,
      message: row.message,
      starts_at: row.starts_at,
      expires_at: row.expires_at,
      updated_at: row.updated_at,
    }
  }

  setBroadcast(
    message: string,
    level: BroadcastLevel = 'important',
    durationHours = 168,
    now = this.clock.now(),
  ): V1Broadcast {
    const normalized = message.trim()
    if (normalized.length === 0) throw new WireError('broadcast.message', 'expected a non-empty message')
    if (!isValidBroadcastMessage(normalized)) {
      throw new WireError('broadcast.message', `expected at most ${BROADCAST_MESSAGE_MAX_LENGTH} printable characters`)
    }
    if (!(BROADCAST_LEVELS as readonly string[]).includes(level)) {
      throw new WireError('broadcast.level', `expected ${BROADCAST_LEVELS.join('/')}`)
    }
    if (!Number.isSafeInteger(durationHours) || durationHours < 1 || durationHours > 720) {
      throw new WireError('broadcast.hours', 'expected an integer in [1,720]')
    }
    const row = {
      id: `broadcast-${now.toString(36)}-${randomBytes(4).toString('hex')}`,
      level,
      message: normalized,
      starts_at: now,
      expires_at: now + durationHours * 60 * 60 * 1000,
      updated_at: now,
    }
    this.store.setBroadcast(row)
    return { ...row }
  }

  clearBroadcast(): boolean {
    return this.store.clearBroadcast()
  }

  /**
   * Rotate to today's case, creating it on first contact and closing every
   * still-open earlier case. Yesterday's votes/tokens stay on yesterday's rows,
   * so nothing leaks across the rollover.
   */
  ensureActiveCase(now = this.clock.now()): CaseRow {
    const businessDate = this.businessDate(now)
    const existing = this.store.activeCaseFor(businessDate)
    if (existing !== undefined && this.archiveCheckedBusinessDate === businessDate) return existing
    const active = this.store.transaction(() => {
      this.store.closeCasesBefore(businessDate, now)
      this.finalizeArchivesInTransaction(businessDate, now)
      const raced = this.store.activeCaseFor(businessDate)
      if (raced !== undefined) return raced
      const queued = this.store.takeQueuedTitle(businessDate, now)
      const previous = this.store.latestCaseBefore(businessDate)
      const title = queued ?? nextCycledCaseTitle(previous?.title, CASE_BANK, this.config.caseTitle)
      const id = `case-${businessDate}`
      this.store.insertCase({
        id,
        businessDate,
        title,
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
      this.replenishAdmissionInventoryInTransaction(now)
      return created
    })
    // Mark the date checked only after COMMIT succeeds. If COMMIT throws, the
    // next request must retry finalization instead of trusting an in-memory flag.
    this.archiveCheckedBusinessDate = businessDate
    return active
  }

  /**
   * Freeze every ended day, then any newly ended ISO week/calendar month.
   * All rows created in one rollover share one archive version. Re-running is
   * idempotent because the source-date query and period ids exclude rows that
   * already exist.
   */
  private finalizeArchivesInTransaction(businessDate: string, now: number): void {
    const pendingDates = this.store.unarchivedCaseDatesBefore(businessDate)
    const existingDays = this.store.dayArchives()
    const candidateDates = [...new Set([
      ...existingDays.map(day => day.business_date),
      ...pendingDates,
    ])]
    const existingWeekIds = new Set(this.store.weekArchives().map(row => row.week_id))
    const existingMonthIds = new Set(this.store.monthArchives().map(row => row.month_id))
    const pendingWeeks = new Map<string, ReturnType<typeof isoWeekFor>>()
    const pendingMonths = new Map<string, ReturnType<typeof monthFor>>()

    for (const date of candidateDates) {
      const week = isoWeekFor(date)
      if (week.endDate < businessDate && !existingWeekIds.has(week.weekId)) {
        pendingWeeks.set(week.weekId, week)
      }
      const month = monthFor(date)
      if (month.endDate < businessDate && !existingMonthIds.has(month.monthId)) {
        pendingMonths.set(month.monthId, month)
      }
    }

    if (pendingDates.length === 0 && pendingWeeks.size === 0 && pendingMonths.size === 0) return
    const archiveVersion = this.store.bumpArchiveVersion()
    for (const date of pendingDates) {
      const source = this.store.dayArchiveSource(date)
      if (source === undefined) continue
      this.store.insertDayArchive({
        business_date: date,
        case_count: source.caseTitles.length,
        case_titles_json: JSON.stringify(source.caseTitles),
        up_votes: source.upVotes,
        down_votes: source.downVotes,
        unique_voters: source.uniqueVoters,
        finalized_at: now,
        archive_version: archiveVersion,
        aggregation_policy_version: LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
        liangzi_policy_version: LIANGZI_POLICY_VERSION,
      })
    }

    const allDays = this.store.dayArchives()
    for (const week of pendingWeeks.values()) {
      const days = allDays.filter(day => day.business_date >= week.startDate && day.business_date <= week.endDate)
      if (days.length === 0) continue
      this.store.insertWeekArchive({
        week_id: week.weekId,
        start_date: week.startDate,
        end_date: week.endDate,
        covered_days: days.length,
        up_votes: days.reduce((sum, day) => sum + day.up_votes, 0),
        down_votes: days.reduce((sum, day) => sum + day.down_votes, 0),
        unique_voters: this.store.countUniqueVoters(week.startDate, week.endDate),
        finalized_at: now,
        archive_version: archiveVersion,
        aggregation_policy_version: LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
        liangzi_policy_version: LIANGZI_POLICY_VERSION,
      })
    }
    for (const month of pendingMonths.values()) {
      const days = allDays.filter(day => day.business_date >= month.startDate && day.business_date <= month.endDate)
      if (days.length === 0) continue
      this.store.insertMonthArchive({
        month_id: month.monthId,
        start_date: month.startDate,
        end_date: month.endDate,
        covered_days: days.length,
        up_votes: days.reduce((sum, day) => sum + day.up_votes, 0),
        down_votes: days.reduce((sum, day) => sum + day.down_votes, 0),
        unique_voters: this.store.countUniqueVoters(month.startDate, month.endDate),
        finalized_at: now,
        archive_version: archiveVersion,
        aggregation_policy_version: LIANG_ARCHIVE_AGGREGATION_POLICY_VERSION,
        liangzi_policy_version: LIANGZI_POLICY_VERSION,
      })
    }
  }

  /** Enqueue a 梁案 for a calendar day, or the next unused midnight (FIFO). */
  enqueueCase(title: string, publishOn: string | null, now = this.clock.now()): QueueRow {
    const { title: normalized } = parseV1PublishCaseRequest({ title })
    if (publishOn !== null && !isBusinessDate(publishOn)) {
      throw new WireError('publish_on', 'expected a real YYYY-MM-DD calendar date')
    }
    if (publishOn !== null && this.store.pendingQueue().some(row => row.publish_on === publishOn)) {
      throw new WireError('publish_on', `a pending case already exists for ${publishOn}`)
    }
    return this.store.enqueueCase(normalized, publishOn, now)
  }

  listQueue(): QueueRow[] {
    return this.store.pendingQueue()
  }

  /** Atomically replace the entire pending schedule with a pre-validated dated plan. */
  replaceQueue(
    entries: Array<{ title: string, publishOn: string }>,
    now = this.clock.now(),
  ): { cleared: number, items: QueueRow[] } {
    if (entries.length === 0) throw new WireError('queue', 'replacement schedule must not be empty')
    const dates = new Set<string>()
    const normalized = entries.map((entry, index) => {
      const { title } = parseV1PublishCaseRequest({ title: entry.title })
      if (!isBusinessDate(entry.publishOn)) {
        throw new WireError(`queue[${index}].publish_on`, 'expected a real YYYY-MM-DD calendar date')
      }
      if (dates.has(entry.publishOn)) {
        throw new WireError(`queue[${index}].publish_on`, `duplicate date ${entry.publishOn}`)
      }
      dates.add(entry.publishOn)
      return { title, publishOn: entry.publishOn }
    })
    return this.store.transaction(() => {
      const cleared = this.store.clearPendingQueue()
      const items = normalized.map(entry => this.store.enqueueCase(entry.title, entry.publishOn, now))
      return { cleared, items }
    })
  }

  /** Public first-install inventory. Secrets are short-lived and claim-limited. */
  admissionTickets(now = this.clock.now()): V1AdmissionTicketsResponse {
    this.store.expireAdmissionTickets(now)
    const inventory = this.store.admissionInventory(now)
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      server_time: now,
      available_claims: inventory.remainingClaims,
      tickets: this.store.availableAdmissionTickets(now, this.config.admissionPublicListLimit).map(ticket => ({
        ticket_id: ticket.ticket_id,
        secret: ticket.secret,
        remaining_claims: ticket.max_claims - ticket.claimed_count,
        expires_at: ticket.expires_at,
      })),
    }
  }

  /** Atomically consume a ticket and bind the signed installation identity. */
  claimAdmission(
    installationId: string,
    publicKey: string,
    deviceFingerprint: string,
    ticketSecret: string,
    now = this.clock.now(),
  ): V1AdmissionClaimResponse {
    return this.store.transaction(() => {
      const existing = this.store.identityByInstallation(installationId)
      if (existing !== undefined) {
        return {
          schema_version: BACKEND_SCHEMA_VERSION,
          claimed: false,
          installation_id: installationId,
          ticket_id: null,
          server_time: now,
        }
      }
      const owner = this.store.identityByFingerprint(deviceFingerprint)
      if (owner !== undefined && owner.installation_id !== installationId) {
        throw new CommunityAuthError(409, 'device_conflict', 'this device fingerprint is already bound to another installation')
      }
      this.store.expireAdmissionTickets(now)
      const ticket = this.store.admissionTicketBySecret(ticketSecret)
      if (ticket === undefined) {
        throw new CommunityAuthError(401, 'admission_ticket_invalid', '入梁券无效')
      }
      if (ticket.status !== 'active' || ticket.expires_at <= now || ticket.claimed_count >= ticket.max_claims) {
        throw new CommunityAuthError(409, 'admission_ticket_exhausted', '入梁券已用尽、失效或过期')
      }
      if (!this.store.consumeAdmissionTicket(ticketSecret, now)) {
        throw new CommunityAuthError(409, 'admission_ticket_exhausted', '入梁券刚刚被其他香客领走')
      }
      try {
        this.store.upsertIdentity({
          installation_id: installationId,
          public_key: publicKey,
          device_fingerprint: deviceFingerprint,
          created_at: now,
          last_seen_at: now,
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new CommunityAuthError(409, 'device_conflict', 'this device fingerprint is already bound to another installation')
        }
        throw error
      }
      return {
        schema_version: BACKEND_SCHEMA_VERSION,
        claimed: true,
        installation_id: installationId,
        ticket_id: ticket.ticket_id,
        server_time: now,
      }
    })
  }

  issueAdmissionTickets(
    count: number,
    maxClaims = this.config.admissionTicketMaxClaims,
    ttlHours = this.config.admissionTicketTtlHours,
    now = this.clock.now(),
  ): AdmissionTicketRow[] {
    return this.store.transaction(() => this.mintAdmissionTickets(count, maxClaims, ttlHours, now))
  }

  admissionInventory(now = this.clock.now()): AdmissionInventory {
    this.store.expireAdmissionTickets(now)
    return this.store.admissionInventory(now)
  }

  listAdmissionTickets(limit = 100, now = this.clock.now()): AdmissionTicketRow[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new WireError('limit', 'expected an integer in [1,1000]')
    }
    this.store.expireAdmissionTickets(now)
    return this.store.availableAdmissionTickets(now, limit)
  }

  revokeAdmissionTicket(ticketId: string): boolean {
    if (!/^ticket_[a-f0-9]{16}$/.test(ticketId)) {
      throw new WireError('ticket_id', 'expected ticket_<16 hex characters>')
    }
    return this.store.revokeAdmissionTicket(ticketId)
  }

  /**
   * Issue just enough new tickets to bring remaining claims back to the
   * configured floor. Does not revoke existing inventory. Automatic top-up
   * runs only when a new business day opens (Shanghai midnight); operators
   * can still call this at any time.
   */
  replenishAdmissionInventory(now = this.clock.now()): {
    issued: number
    remaining_claims: number
    target: number
  } {
    return this.store.transaction(() => this.replenishAdmissionInventoryInTransaction(now))
  }

  private replenishAdmissionInventoryInTransaction(now: number): {
    issued: number
    remaining_claims: number
    target: number
  } {
    const target = this.config.admissionInventoryTarget
    this.store.expireAdmissionTickets(now)
    const remaining = this.store.admissionInventory(now).remainingClaims
    if (target <= 0) {
      return { issued: 0, remaining_claims: remaining, target }
    }
    const deficit = target - remaining
    if (deficit <= 0) {
      return { issued: 0, remaining_claims: remaining, target }
    }
    this.mintAdmissionTickets(
      deficit,
      this.config.admissionTicketMaxClaims,
      this.config.admissionTicketTtlHours,
      now,
    )
    const after = this.store.admissionInventory(now).remainingClaims
    this.warn(
      `[liangxiang-backend] admission inventory topped up issued=${deficit} remaining=${after} target=${target}`,
    )
    return { issued: deficit, remaining_claims: after, target }
  }

  /**
   * Operator retitle: change today's active case title in place.
   * Votes, snapshots, incense, and `case_id` stay. Use this instead of
   * `publishCase` when the live question should change without resetting the day.
   */
  retitleActiveCase(title: string, now = this.clock.now()): V1SnapshotResponse {
    const { title: normalized } = parseV1PublishCaseRequest({ title })
    const caseRow = this.ensureActiveCase(now)
    const updated = this.store.updateActiveCaseTitle(caseRow.id, normalized)
    if (!updated) throw new Error('failed to retitle the active case')
    return this.snapshotResponse(now)
  }

  /**
   * Operator publish: archive today's active case (if any), open a new one,
   * publish a zero-vote snapshot, and clear spent incense for the business
   * date. Claimed tokens stay, so remaining incense can be spent on the new
   * case. Old votes/stats/snapshots remain on the archived `case_id`.
   *
   * Temporarily allows more than one case per day; the DB still enforces at
   * most one *active* case at a time.
   */
  publishCase(title: string, now = this.clock.now()): V1PublishCaseResponse {
    const { title: normalized } = parseV1PublishCaseRequest({ title })
    return this.store.transaction(() => {
      const businessDate = this.businessDate(now)
      this.store.closeCasesBefore(businessDate, now)
      const previous = this.store.activeCaseFor(businessDate)
      if (previous !== undefined) {
        this.store.closeActiveCaseFor(businessDate, now)
      }
      this.store.resetUsedIncenseForDate(businessDate, now)
      const id = `case-${businessDate}-${randomBytes(4).toString('hex')}`
      this.store.insertCase({
        id,
        businessDate,
        title: normalized,
        tokenPerIncense: this.config.tokenPerIncense,
        liangziPolicyVersion: LIANGZI_POLICY_VERSION,
        now,
      })
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
      if (created === undefined) throw new Error('failed to open the published case')
      const archived = previous === undefined ? null : this.store.caseById(previous.id) ?? previous
      return {
        schema_version: BACKEND_SCHEMA_VERSION,
        business_date: businessDate,
        server_time: now,
        archived_case: archived === null ? null : toV1Case(archived),
        active_case: toV1Case(created),
        global_snapshot: this.publishedSnapshot(created, now, { publish: false }),
      }
    })
  }

  bootstrap(installationId: string, now = this.clock.now()): V1Bootstrap {
    const caseRow = this.ensureActiveCase(now)
    this.store.transaction(() => this.ensureRow(installationId, caseRow, now))
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      authority_mode: this.config.authorityMode,
      server_time: now,
      business_date: caseRow.business_date,
      business_timezone: this.dates.timezone,
      archive_version: this.store.archiveVersion(),
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
      broadcast: this.activeBroadcast(now),
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
    let claimNotice: V1PersonalStateResponse['claim_notice']
    if (claim.claim_business_date === caseRow.business_date) {
      const outcome = this.store.transaction(() => {
        this.ensureRow(installationId, caseRow, now)
        const row = this.requireRow(installationId, caseRow.business_date)
        const requested = claim.claimed_effective_tokens
        // Monotonic ratchet only: the claim is a host observation (A3 soft
        // trust), never rewound. A single-claim jump beyond the absurd ceiling
        // is clamped WITH a notice — it is a guard against an impossible
        // self-report, never a silent "香火不涨".
        if (requested <= row.claimed_effective_tokens) {
          this.warn(
            `[liangxiang-backend] claim below_watermark: install=${installationId.slice(0, 8)}… `
            + `requested=${requested} have=${row.claimed_effective_tokens}`,
          )
          return { applied: false, notice: undefined }
        }
        let target = requested
        let notice: V1PersonalStateResponse['claim_notice']
        const ceiling = this.config.absurdClaimTokens
        if (ceiling > 0 && requested - row.claimed_effective_tokens > ceiling) {
          target = row.claimed_effective_tokens + ceiling
          notice = 'claim_capped_absurd'
          this.warn(
            `[liangxiang-backend] absurd claim clamped: install=${installationId.slice(0, 8)}… `
            + `requested=${requested} clamped_to=${target} ceiling=${ceiling}`,
          )
        }
        this.store.raiseClaim(installationId, caseRow.business_date, target, now)
        return { applied: true, notice }
      })
      applied = outcome.applied
      claimNotice = outcome.notice
    } else {
      this.warn(
        `[liangxiang-backend] ignoring token claim for ${claim.claim_business_date} `
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
      ...claimNotice === undefined ? {} : { claim_notice: claimNotice },
    }
  }

  dailyState(installationId: string, now = this.clock.now()): V1PersonalStateResponse {
    const caseRow = this.ensureActiveCase(now)
    this.store.transaction(() => this.ensureRow(installationId, caseRow, now))
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
      archive_version: this.store.archiveVersion(),
      active_case: toV1Case(caseRow),
      global_snapshot: this.publishedSnapshot(caseRow, now),
      broadcast: this.activeBroadcast(now),
    }
  }

  /**
   * Operator wipe of today's votes so the live case returns to 待开梁.
   * Claimed tokens, identities, tickets, and 梁祠 archives stay.
   */
  resetTodayCase(now = this.clock.now()): {
    business_date: string
    case_id: string | null
    title: string | null
    votes: number
    closed_cases: number
    incense_rows: number
    global_snapshot: V1Snapshot
  } {
    const businessDate = this.businessDate(now)
    return this.store.transaction(() => {
      const active = this.store.activeCaseFor(businessDate)
      if (active === undefined) {
        throw new WireError('case', `no active case on ${businessDate}`)
      }
      const cleared = this.store.resetBusinessDate(businessDate, now)
      const after = this.store.activeCaseFor(businessDate) ?? active
      return {
        business_date: businessDate,
        case_id: cleared.activeCaseId ?? after.id,
        title: after.title,
        votes: cleared.votes,
        closed_cases: cleared.closedCases,
        incense_rows: cleared.incenseRows,
        global_snapshot: this.publishedSnapshot(after, now, { publish: false }),
      }
    })
  }

  /**
   * Revoke every active ticket, then issue a fresh gray-release inventory.
   */
  replaceAdmissionTickets(
    count: number,
    maxClaims = 1,
    ttlHours = this.config.admissionTicketTtlHours,
    now = this.clock.now(),
  ): {
    revoked: number
    issued: number
    max_claims: number
    ttl_hours: number
    expires_at: number | null
    inventory: ReturnType<LiangxiangBackendService['admissionInventory']>
  } {
    return this.store.transaction(() => {
      this.store.expireAdmissionTickets(now)
      const revoked = this.store.revokeActiveAdmissionTickets()
      const tickets = this.mintAdmissionTickets(count, maxClaims, ttlHours, now)
      return {
        revoked,
        issued: tickets.length,
        max_claims: maxClaims,
        ttl_hours: ttlHours,
        expires_at: tickets[0]?.expires_at ?? null,
        inventory: this.store.admissionInventory(now),
      }
    })
  }

  private mintAdmissionTickets(
    count: number,
    maxClaims: number,
    ttlHours: number,
    now: number,
  ): AdmissionTicketRow[] {
    if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) {
      throw new WireError('count', 'expected an integer in [1,100000]')
    }
    if (!Number.isSafeInteger(maxClaims) || maxClaims < 1 || maxClaims > 10_000) {
      throw new WireError('max_claims', 'expected an integer in [1,10000]')
    }
    if (!Number.isSafeInteger(ttlHours) || ttlHours < 1 || ttlHours > 24 * 365) {
      throw new WireError('ttl_hours', 'expected an integer in [1,8760]')
    }
    const expiresAt = now + ttlHours * 60 * 60 * 1000
    return Array.from({ length: count }, () => {
      const idPart = randomBytes(8).toString('hex')
      const secretPart = randomBytes(12).toString('base64url')
      const row: AdmissionTicketRow = {
        ticket_id: `ticket_${idPart}`,
        secret: `LX-${secretPart}`,
        max_claims: maxClaims,
        claimed_count: 0,
        status: 'active',
        created_at: now,
        expires_at: expiresAt,
        last_claimed_at: null,
      }
      this.store.insertAdmissionTicket(row)
      return row
    })
  }

  /**
   * Operator wipe of 梁祠 history. Keeps today's case, identities, tickets,
   * incense ledgers, and the unpublished queue. Open WebUI clients must restart
   * to drop their last-known-good archive cache.
   */
  clearHistoryArchives(now = this.clock.now()): {
    business_date: string
    days: number
    weeks: number
    months: number
    closed_cases: number
  } {
    const businessDate = this.businessDate(now)
    return this.store.transaction(() => {
      const cleared = this.store.clearHistoryArchives(businessDate)
      return {
        business_date: businessDate,
        days: cleared.days,
        weeks: cleared.weeks,
        months: cleared.months,
        closed_cases: cleared.closedCases,
      }
    })
  }

  /** Initial full archive or immutable rows newer than one cursor. */
  historyResponse(afterVersion?: number, now = this.clock.now()): V1HistoryResponse {
    const activeCase = this.ensureActiveCase(now)
    if (afterVersion !== undefined && (!Number.isSafeInteger(afterVersion) || afterVersion < 0)) {
      throw new WireError('after_version', 'expected a non-negative safe integer')
    }
    const full = afterVersion === undefined
    const cursor = afterVersion ?? -1
    const days = this.store.dayArchives(cursor).map(row => {
      let titles: unknown
      try {
        titles = JSON.parse(row.case_titles_json)
      } catch {
        throw new Error(`invalid archived case title JSON for ${row.business_date}`)
      }
      if (!Array.isArray(titles) || !titles.every(title => typeof title === 'string')) {
        throw new Error(`invalid archived case title list for ${row.business_date}`)
      }
      return {
        businessDate: row.business_date,
        caseCount: row.case_count,
        caseTitles: titles,
        finalizedAt: row.finalized_at,
        archiveVersion: row.archive_version,
        aggregationPolicyVersion: row.aggregation_policy_version,
        liangziPolicyVersion: row.liangzi_policy_version,
        ...deriveArchiveResult(row.up_votes, row.down_votes, Number(row.unique_voters ?? 0)),
      }
    })
    const weeks = this.store.weekArchives(cursor).map(row => archivePeriodRow(row, 'week', this.policy))
    const months = this.store.monthArchives(cursor).map(row => archivePeriodRow(row, 'month', this.policy))
    return historyArchiveToV1({
      archiveVersion: this.store.archiveVersion(),
      businessDate: activeCase.business_date,
      businessTimezone: this.dates.timezone,
      stale: false,
      days,
      weeks,
      months,
      openWeekUniqueVoters: this.openPeriodUniqueVoters('week', activeCase.business_date),
      openMonthUniqueVoters: this.openPeriodUniqueVoters('month', activeCase.business_date),
    }, full)
  }

  /** Distinct installations in the still-open week/month, excluding today. */
  private openPeriodUniqueVoters(kind: 'week' | 'month', businessDate: string): number {
    const bounds = kind === 'week' ? isoWeekFor(businessDate) : monthFor(businessDate)
    const yesterday = addBusinessDays(businessDate, -1)
    if (yesterday < bounds.startDate) return 0
    const end = yesterday < bounds.endDate ? yesterday : bounds.endDate
    return this.store.countUniqueVoters(bounds.startDate, end)
  }

  /**
   * Self-serve revoke: the holder of this installation's private key deletes
   * their own identity row. Incense/votes on the id are orphaned. HTTP rate
   * limits this; the service itself just deletes.
   */
  revokeIdentity(installationId: string, now = this.clock.now()): V1UnbindResponse {
    return this.unbindIdentity(installationId, now)
  }

  /**
   * Operator unbind: delete one installation's identity row so its device
   * fingerprint is released and it can re-register (same or fresh key). The old
   * identity's incense/votes are orphaned — its key can no longer authenticate.
   * Operator path is CLI-only (no HTTP).
   */
  unbindIdentity(installationId: string, now = this.clock.now()): V1UnbindResponse {
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      installation_id: installationId,
      unbound: this.store.deleteIdentity(installationId),
      server_time: now,
    }
  }

  /**
   * Self-serve re-key — the "cost" of recovery. A device whose MAC fingerprint
   * is already bound to a previous installation may take over that binding, but
   * only after `rekeyCooldownMs` has elapsed since the previous identity was
   * last seen, and only by forfeiting it: its incense/votes are never
   * transferred to the new key (the new id starts at zero).
   */
  rekeyIdentity(
    installationId: string,
    publicKey: string,
    deviceFingerprint: string,
    now = this.clock.now(),
  ): V1RekeyResponse {
    if (deviceFingerprint === '') {
      throw new CommunityAuthError(400, 'invalid_request', 'a device fingerprint is required to re-key')
    }
    const previous = this.store.identityByFingerprint(deviceFingerprint)
    if (previous === undefined) {
      this.store.upsertIdentity({
        installation_id: installationId,
        public_key: publicKey,
        device_fingerprint: deviceFingerprint,
        created_at: now,
        last_seen_at: now,
      })
      return {
        schema_version: BACKEND_SCHEMA_VERSION,
        rekeyed: false,
        installation_id: installationId,
        previous_installation_id: null,
        server_time: now,
      }
    }
    if (previous.installation_id === installationId) {
      return {
        schema_version: BACKEND_SCHEMA_VERSION,
        rekeyed: false,
        installation_id: installationId,
        previous_installation_id: null,
        server_time: now,
      }
    }
    const cooldown = this.config.rekeyCooldownMs
    if (cooldown > 0) {
      const elapsed = now - previous.last_seen_at
      if (elapsed < cooldown) {
        throw new CommunityAuthError(
          409,
          'rekey_cooldown',
          `device fingerprint was active ${elapsed} ms ago; wait ${cooldown - elapsed} ms before re-keying`,
        )
      }
    }
    this.store.transaction(() => {
      this.store.deleteIdentity(previous.installation_id)
      this.store.upsertIdentity({
        installation_id: installationId,
        public_key: publicKey,
        device_fingerprint: deviceFingerprint,
        created_at: now,
        last_seen_at: now,
      })
    })
    this.warn(
      `[liangxiang-backend] rekey: device ${deviceFingerprint.slice(0, 8)}… `
      + `${previous.installation_id.slice(0, 8)}… -> ${installationId.slice(0, 8)}…`,
    )
    return {
      schema_version: BACKEND_SCHEMA_VERSION,
      rekeyed: true,
      installation_id: installationId,
      previous_installation_id: previous.installation_id,
      server_time: now,
    }
  }

  /**
   * The vote transaction: identity + case validation, idempotency, atomic
   * spend, vote record, aggregate update AND the new published snapshot — all
   * inside one `BEGIN IMMEDIATE`.
   *
   * Publishing here (rather than only on the cadence) is what makes a vote feel
   * like a vote: the response already carries the snapshot that contains it, so
   * the voter sees 梁位 move on the click instead of up to a cadence later. The
   * snapshot is still a single self-consistent row, so ratios and Liangzi state
   * can never come from different versions.
   */
  vote(
    installationId: string,
    intent: V1VoteRequest,
    now = this.clock.now(),
    maxSpend = Number.POSITIVE_INFINITY,
  ): V1VoteResponse {
    const activeCase = this.ensureActiveCase(now)
    let result: V1VoteResult
    try {
      result = this.store.transaction(() => {
        const outcome = this.voteInTransaction(installationId, intent, activeCase, now, maxSpend)
        if (outcome.status === 'accepted' && !outcome.replayed) {
          this.publishInTransaction(activeCase, now)
        }
        return outcome
      })
    } catch (error) {
      if (error instanceof DuplicateRequestSignal) {
        // The concurrent winner already committed; report its outcome verbatim.
        result = this.replayResult(installationId, intent, activeCase)
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
      global_snapshot: snapshot,
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
    maxSpend: number,
  ): V1VoteResult {
    const requestedCount = intent.count ?? 1
    const existingRequest = this.store.voteRequestByRequestId(installationId, intent.request_id)
    if (existingRequest !== undefined) {
      if (!this.sameVoteIntent(existingRequest, intent, requestedCount)) {
        return rejected(
          intent,
          'idempotency_conflict',
          'request id was already used with a different payload',
        )
      }
      return this.replayStoredRequest(installationId, intent, existingRequest, activeCase)
    }

    const target = this.store.caseById(intent.case_id)
    if (target === undefined) {
      return this.recordRejectedRequest(
        installationId,
        intent,
        activeCase,
        requestedCount,
        now,
        'stale_case',
        `case ${intent.case_id} does not exist`,
      )
    }
    if (target.status !== 'active') {
      return this.recordRejectedRequest(
        installationId,
        intent,
        activeCase,
        requestedCount,
        now,
        'case_not_active',
        `case ${intent.case_id} is closed`,
      )
    }
    if (target.id !== activeCase.id || target.business_date !== activeCase.business_date) {
      return this.recordRejectedRequest(
        installationId,
        intent,
        activeCase,
        requestedCount,
        now,
        'stale_case',
        `case ${intent.case_id} is not the active case`,
      )
    }

    this.ensureRow(installationId, target, now)
    // Read before the insert: after it, this installation always has a vote.
    const firstVoteForCase = !this.store.hasVotedForCase(installationId, target.id)
    const remaining = this.remainingFor(installationId, target)
    const spent = clampVoteSpend(requestedCount, remaining, maxSpend)
    if (spent < 1) {
      return this.recordRejectedRequest(
        installationId,
        intent,
        activeCase,
        requestedCount,
        now,
        'insufficient_incense',
        'no remaining incense today',
      )
    }
    if (!this.store.spendIncense(installationId, target.business_date, spent, now)) {
      return this.recordRejectedRequest(
        installationId,
        intent,
        activeCase,
        requestedCount,
        now,
        'insufficient_incense',
        'no remaining incense today',
      )
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
        requested_count: requestedCount,
        used_incense_after: row.used_incense,
        remaining_incense_after: earned - row.used_incense,
        created_at: now,
      })
      this.store.insertVoteRequest({
        installation_id: installationId,
        request_id: intent.request_id,
        case_id: intent.case_id,
        business_date: activeCase.business_date,
        vote_type: intent.vote_type,
        requested_count: requestedCount,
        result_status: 'accepted',
        rejection_reason: null,
        rejection_message: null,
        created_at: now,
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Roll back this spend: the duplicate is the same business intent.
        throw new DuplicateRequestSignal(intent.request_id)
      }
      throw error
    }
    this.store.applyAcceptedVoteToStats(target.id, intent.vote_type, spent, firstVoteForCase, now)
    return {
      status: 'accepted',
      request_id: intent.request_id,
      vote_type: intent.vote_type,
      used_incense: row.used_incense,
      remaining_incense: earned - row.used_incense,
      spent_incense: spent,
      replayed: false,
    }
  }

  private replayResult(
    installationId: string,
    intent: V1VoteRequest,
    activeCase: CaseRow,
  ): V1VoteResult {
    const stored = this.store.voteRequestByRequestId(installationId, intent.request_id)
    if (stored === undefined) {
      return rejected(intent, 'invalid_intent', 'vote could not be recorded; retry with the same request id')
    }
    if (!this.sameVoteIntent(stored, intent, intent.count ?? 1)) {
      return rejected(intent, 'idempotency_conflict', 'request id was already used with a different payload')
    }
    return this.replayStoredRequest(installationId, intent, stored, activeCase)
  }

  private replayStoredRequest(
    installationId: string,
    intent: V1VoteRequest,
    stored: VoteRequestRow,
    activeCase: CaseRow,
  ): V1VoteResult {
    if (stored.result_status === 'rejected') {
      if (stored.rejection_reason === null || stored.rejection_message === null) {
        return rejected(intent, 'invalid_intent', 'stored vote rejection is incomplete')
      }
      return rejected(intent, stored.rejection_reason, stored.rejection_message)
    }
    const vote = this.store.voteByRequestId(installationId, intent.request_id)
    if (vote === undefined) {
      return rejected(intent, 'invalid_intent', 'stored accepted vote is missing its ledger row')
    }
    return this.replayAccepted(installationId, intent, vote, activeCase)
  }

  private replayAccepted(
    installationId: string,
    intent: V1VoteRequest,
    stored: { vote_type: V1VoteRequest['vote_type'], used_incense_after: number, remaining_incense_after: number },
    caseRow: CaseRow | undefined,
  ): V1VoteResult {
    const row = caseRow === undefined
      ? undefined
      : this.store.incenseFor(installationId, caseRow.business_date)
    // The accepted disposition is immutable, while these counters belong to
    // the response's current business-date envelope. After rollover (or an
    // operator case reset) there may be no current row yet; that means 0/0,
    // never yesterday's stored counters.
    const used = row?.used_incense ?? 0
    const remaining = row === undefined
      ? 0
      : Math.floor(row.claimed_effective_tokens / row.token_per_incense) - row.used_incense
    return {
      status: 'accepted',
      request_id: intent.request_id,
      vote_type: stored.vote_type,
      used_incense: used,
      remaining_incense: remaining,
      spent_incense: 0,
      replayed: true,
    }
  }

  /**
   * Compare the complete normalized vote intent persisted by schema v9.
   *
   * V7 rows have no recoverable requested count: the accepted spend may have
   * been clamped by the remaining balance or the token bucket. Fail closed for
   * an explicit bulk retry, while retaining safe one-stick replay compatibility.
   */
  private sameVoteIntent(
    stored: { case_id: string, vote_type: V1VoteRequest['vote_type'], requested_count: number | null },
    intent: V1VoteRequest,
    requestedCount: number,
  ): boolean {
    return stored.case_id === intent.case_id
      && stored.vote_type === intent.vote_type
      && (stored.requested_count === null
        ? requestedCount === 1
        : stored.requested_count === requestedCount)
  }

  private recordRejectedRequest(
    installationId: string,
    intent: V1VoteRequest,
    activeCase: CaseRow,
    requestedCount: number,
    now: number,
    reason: Extract<V1VoteResult, { status: 'rejected' }>['reason'],
    message: string,
  ): V1VoteResult {
    const result = rejected(intent, reason, message)
    try {
      this.store.insertVoteRequest({
        installation_id: installationId,
        request_id: intent.request_id,
        case_id: intent.case_id,
        business_date: activeCase.business_date,
        vote_type: intent.vote_type,
        requested_count: requestedCount,
        result_status: 'rejected',
        rejection_reason: reason,
        rejection_message: message,
        created_at: now,
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new DuplicateRequestSignal(intent.request_id)
      throw error
    }
    return result
  }

  private ensureRow(installationId: string, caseRow: CaseRow, now: number): void {
    this.store.ensureIncenseRow(
      installationId,
      caseRow.business_date,
      caseRow.token_per_incense,
      CLAIM_SOURCE_HOST_OBSERVED,
      now,
    )
    this.tryGrantStarter(installationId, caseRow, now)
  }

  /**
   * One welcome gift per device fingerprint per business date. Re-keying the
   * same machine does not mint another 10 sticks; the grant row outlives the
   * old installation id. Unsigned / fingerprint-less rows stay at zero.
   */
  private tryGrantStarter(installationId: string, caseRow: CaseRow, now: number): void {
    if (this.config.starterIncenseCount <= 0) return
    const fingerprint = this.store.identityByInstallation(installationId)?.device_fingerprint?.trim() ?? ''
    if (fingerprint === '') return
    const tokens = this.config.starterIncenseCount * caseRow.token_per_incense
    if (!this.store.tryInsertStarterGrant(
      fingerprint,
      caseRow.business_date,
      installationId,
      tokens,
      now,
    )) return
    this.store.addStarterTokens(installationId, caseRow.business_date, tokens, now)
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
    return toV1Snapshot(row, this.policy, this.store.lifetimeTotals())
  }

  private isPublishDue(latest: SnapshotRow | undefined, stats: StatsRow, now: number): boolean {
    if (latest === undefined) return true
    const moved = latest.up_votes !== stats.up_votes
      || latest.down_votes !== stats.down_votes
      || latest.unique_voters !== stats.unique_voters
    if (!moved) return false
    return now - latest.captured_at >= this.config.snapshotRefreshSeconds * 1000
  }

  /** Append the current aggregate as a new snapshot; caller owns the transaction. */
  private publishInTransaction(caseRow: CaseRow, now: number): SnapshotRow {
    const stats = this.statsOf(caseRow)
    const latest = this.store.latestSnapshot(caseRow.id)
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
    this.store.insertSnapshot(row)
    this.store.pruneSnapshots(caseRow.id, SNAPSHOT_HISTORY_LIMIT)
    return row
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
export function toV1Snapshot(
  row: SnapshotRow,
  policy: LiangziThresholdPolicy,
  lifetime?: { incense: number, voters: number },
): V1Snapshot {
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
    lifetime_incense: lifetime?.incense ?? totalIncense,
    lifetime_voters: lifetime?.voters ?? row.unique_voters,
  }
}

function archivePeriodRow(
  row: WeekArchiveRow,
  kind: 'week',
  policy: LiangziThresholdPolicy,
): import('../domain/index.ts').LiangWeekArchive
function archivePeriodRow(
  row: MonthArchiveRow,
  kind: 'month',
  policy: LiangziThresholdPolicy,
): import('../domain/index.ts').LiangMonthArchive
function archivePeriodRow(
  row: WeekArchiveRow | MonthArchiveRow,
  kind: 'week' | 'month',
  policy: LiangziThresholdPolicy,
): import('../domain/index.ts').LiangWeekArchive | import('../domain/index.ts').LiangMonthArchive {
  const derived = deriveArchiveResult(row.up_votes, row.down_votes, Number(row.unique_voters ?? 0))
  const common = {
    startDate: row.start_date,
    endDate: row.end_date,
    coveredDays: row.covered_days,
    ...derived,
    liangziState: deriveLiangziState(row.up_votes, row.down_votes, policy),
    finalizedAt: row.finalized_at,
    archiveVersion: row.archive_version,
    aggregationPolicyVersion: row.aggregation_policy_version,
    liangziPolicyVersion: row.liangzi_policy_version,
  }
  return kind === 'week'
    ? { weekId: (row as WeekArchiveRow).week_id, ...common }
    : { monthId: (row as MonthArchiveRow).month_id, ...common }
}
