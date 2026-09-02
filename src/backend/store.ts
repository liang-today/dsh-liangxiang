/**
 * SQLite access layer: prepared statements + one transaction helper.
 *
 * Everything the vote path needs is expressed as a single guarded statement so
 * correctness does not depend on the runtime being single-threaded:
 *
 *   - `spendOneIncense` is a conditional UPDATE (compare-and-set on
 *     `used_incense` + affordability). `changes === 0` means "someone else got
 *     the last stick", which is exactly the overspend guard.
 *   - `insertVote` relies on `UNIQUE (installation_id, request_id)`; a losing
 *     concurrent duplicate raises a constraint error the service turns into an
 *     idempotent replay instead of a second spend.
 *
 * WAL + a busy timeout keep this valid for multiple processes/tabs sharing one
 * database file.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { VoteType } from '../domain/index.ts'
import { migrate } from './schema.ts'

export interface CaseRow {
  id: string
  business_date: string
  title: string
  status: 'active' | 'closed'
  token_per_incense: number
  liangzi_policy_version: string
  created_at: number
  opened_at: number
  closed_at: number | null
}

export interface IncenseRow {
  installation_id: string
  business_date: string
  claimed_effective_tokens: number
  used_incense: number
  token_per_incense: number
  claim_source: string
  starter_tokens: number
  version: number
  created_at: number
  updated_at: number
}

export interface StatsRow {
  case_id: string
  business_date: string
  up_votes: number
  down_votes: number
  unique_voters: number
  version: number
  updated_at: number
}

export interface SnapshotRow {
  case_id: string
  sequence: number
  business_date: string
  up_votes: number
  down_votes: number
  unique_voters: number
  policy_version: string
  captured_at: number
}

export interface DayArchiveRow {
  business_date: string
  case_count: number
  case_titles_json: string
  up_votes: number
  down_votes: number
  unique_voters: number
  finalized_at: number
  archive_version: number
  aggregation_policy_version: string
  liangzi_policy_version: string
}

export interface WeekArchiveRow {
  week_id: string
  start_date: string
  end_date: string
  covered_days: number
  up_votes: number
  down_votes: number
  unique_voters: number
  finalized_at: number
  archive_version: number
  aggregation_policy_version: string
  liangzi_policy_version: string
}

export interface MonthArchiveRow {
  month_id: string
  start_date: string
  end_date: string
  covered_days: number
  up_votes: number
  down_votes: number
  unique_voters: number
  finalized_at: number
  archive_version: number
  aggregation_policy_version: string
  liangzi_policy_version: string
}

export interface DayArchiveSource {
  businessDate: string
  caseTitles: string[]
  upVotes: number
  downVotes: number
  uniqueVoters: number
}

export interface CommunityIdentityRow {
  installation_id: string
  public_key: string
  device_fingerprint: string | null
  created_at: number
  last_seen_at: number
}

export type AdmissionTicketStatus = 'active' | 'exhausted' | 'revoked' | 'expired'

export interface AdmissionTicketRow {
  ticket_id: string
  secret: string
  max_claims: number
  claimed_count: number
  status: AdmissionTicketStatus
  created_at: number
  expires_at: number
  last_claimed_at: number | null
}

export interface AdmissionInventory {
  activeTickets: number
  remainingClaims: number
  exhaustedTickets: number
  expiredTickets: number
  revokedTickets: number
  totalTickets: number
}

export interface VoteRow {
  id: number
  request_id: string
  installation_id: string
  case_id: string
  business_date: string
  vote_type: VoteType
  /** NULL only for rows accepted before schema v8, when count was not stored. */
  requested_count: number | null
  used_incense_after: number
  remaining_incense_after: number
  created_at: number
}

export interface InsertCaseInput {
  id: string
  businessDate: string
  title: string
  tokenPerIncense: number
  liangziPolicyVersion: string
  now: number
}

export interface BackendStore {
  /** Run `body` inside one `BEGIN IMMEDIATE` transaction. */
  transaction: <T>(body: () => T) => T
  activeCaseFor: (businessDate: string) => CaseRow | undefined
  caseById: (caseId: string) => CaseRow | undefined
  insertCase: (input: InsertCaseInput) => void
  closeCasesBefore: (businessDate: string, now: number) => number
  /** Close today's active case (same-day republish). Returns rows changed. */
  closeActiveCaseFor: (businessDate: string, now: number) => number
  /** Clear spent incense for a business date; claimed tokens stay. */
  resetUsedIncenseForDate: (businessDate: string, now: number) => number
  statsFor: (caseId: string) => StatsRow | undefined
  incenseFor: (installationId: string, businessDate: string) => IncenseRow | undefined
  ensureIncenseRow: (
    installationId: string,
    businessDate: string,
    tokenPerIncense: number,
    claimSource: string,
    now: number,
  ) => void
  /** Monotonic claim ratchet; returns true when the stored claim grew. */
  raiseClaim: (installationId: string, businessDate: string, claimed: number, now: number) => boolean
  /**
   * Record a fingerprint+date welcome grant. False if that device already
   * received one today (survives re-key because it is not keyed by installation).
   */
  tryInsertStarterGrant: (
    fingerprint: string,
    businessDate: string,
    installationId: string,
    grantedTokens: number,
    now: number,
  ) => boolean
  /** Credit gift tokens into the daily ledger. Caller must own a transaction. */
  addStarterTokens: (
    installationId: string,
    businessDate: string,
    tokens: number,
    now: number,
  ) => boolean
  /** Conditional spend; false means unaffordable/lost race (no row changed). */
  spendOneIncense: (installationId: string, businessDate: string, now: number) => boolean
  /** Spend `count` sticks atomically; false if the pool cannot cover it. */
  spendIncense: (installationId: string, businessDate: string, count: number, now: number) => boolean
  voteByRequestId: (installationId: string, requestId: string) => VoteRow | undefined
  /** Latest accepted vote time for this installation; null if they have never voted. */
  lastAcceptedVoteAt: (installationId: string) => number | null
  hasVotedForCase: (installationId: string, caseId: string) => boolean
  insertVote: (row: Omit<VoteRow, 'id'>) => void
  applyAcceptedVoteToStats: (
    caseId: string,
    voteType: VoteType,
    count: number,
    firstVoter: boolean,
    now: number,
  ) => void
  latestSnapshot: (caseId: string) => SnapshotRow | undefined
  insertSnapshot: (row: SnapshotRow) => void
  /** Drop all but the newest `keep` snapshots of one case; returns rows deleted. */
  pruneSnapshots: (caseId: string, keep: number) => number
  /** Monotonic cursor shared by immutable day/week/month archive rows. */
  archiveVersion: () => number
  /** Increment and return the archive cursor. Caller must own a transaction. */
  bumpArchiveVersion: () => number
  unarchivedCaseDatesBefore: (businessDate: string) => string[]
  /** Distinct installations with at least one accepted vote in the inclusive date range. */
  countUniqueVoters: (startDate: string, endDate: string) => number
  dayArchiveSource: (businessDate: string) => DayArchiveSource | undefined
  insertDayArchive: (row: DayArchiveRow) => void
  insertWeekArchive: (row: WeekArchiveRow) => void
  insertMonthArchive: (row: MonthArchiveRow) => void
  dayArchives: (afterVersion?: number) => DayArchiveRow[]
  weekArchives: (afterVersion?: number) => WeekArchiveRow[]
  monthArchives: (afterVersion?: number) => MonthArchiveRow[]
  /**
   * Wipe 梁祠 history before `keepBusinessDate`. Caller must own a transaction.
   * Today's case, identities, tickets, incense, and the queue stay.
   */
  clearHistoryArchives: (keepBusinessDate: string) => {
    days: number
    weeks: number
    months: number
    closedCases: number
  }
  /**
   * Zero today's case back to 待开梁. Caller must own a transaction.
   * Identities, claimed tokens, tickets, and 梁祠 archives stay.
   */
  resetBusinessDate: (businessDate: string, now: number) => {
    votes: number
    closedCases: number
    incenseRows: number
    activeCaseId: string | undefined
  }
  /** Revoke every still-active ticket. Caller may wrap this in a transaction. */
  revokeActiveAdmissionTickets: () => number
  identityByInstallation: (installationId: string) => CommunityIdentityRow | undefined
  identityByPublicKey: (publicKey: string) => CommunityIdentityRow | undefined
  identityByFingerprint: (fingerprint: string) => CommunityIdentityRow | undefined
  /**
   * Insert or refresh last_seen. Throws SQLITE unique on a fingerprint already
   * bound to a different installation.
   */
  upsertIdentity: (row: CommunityIdentityRow) => void
  /** Delete one community_identity row (operator unbind / rekey takeover). */
  deleteIdentity: (installationId: string) => boolean
  insertAdmissionTicket: (row: AdmissionTicketRow) => void
  admissionTicketBySecret: (secret: string) => AdmissionTicketRow | undefined
  availableAdmissionTickets: (now: number, limit: number) => AdmissionTicketRow[]
  /** Atomically consume one claim; false means unavailable/lost race. */
  consumeAdmissionTicket: (secret: string, now: number) => boolean
  expireAdmissionTickets: (now: number) => number
  revokeAdmissionTicket: (ticketId: string) => boolean
  admissionInventory: (now: number) => AdmissionInventory
  /** Most recently opened case strictly before this business date. */
  latestCaseBefore: (businessDate: string) => CaseRow | undefined
  lifetimeTotals: () => { incense: number, voters: number }
  enqueueCase: (title: string, publishOn: string | null, now: number) => QueueRow
  pendingQueue: () => QueueRow[]
  /** Delete every not-yet-consumed queue row. Caller may wrap this in a transaction. */
  clearPendingQueue: () => number
  /** First unused queue row for `today`, else the oldest undated FIFO row. */
  takeQueuedTitle: (today: string, now: number) => string | undefined
  /** Change the active case title in place. Votes and `case_id` stay. */
  updateActiveCaseTitle: (caseId: string, title: string) => boolean
  close: () => void
}

export interface QueueRow {
  id: number
  title: string
  publish_on: string | null
  sort_order: number
  created_at: number
  consumed_at: number | null
}

/** SQLite constraint failures we translate into business outcomes. */
export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT_UNIQUE')
}

function changed(result: { changes: number | bigint }): number {
  return Number(result.changes)
}

/**
 * Open (creating if needed) the backend database and prepare every statement.
 * @param databasePath - file path, or `:memory:` for tests.
 * @returns the store handle; the caller owns `close()`.
 */
export function openBackendStore(databasePath: string): BackendStore {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true })
  }
  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA busy_timeout = 5000')
  if (databasePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL')
  }
  db.exec('PRAGMA synchronous = NORMAL')
  migrate(db)

  const selectActiveCase = db.prepare(
    `SELECT * FROM daily_liang_case WHERE business_date = ? AND status = 'active'`,
  )
  const selectCaseById = db.prepare('SELECT * FROM daily_liang_case WHERE id = ?')
  const insertCaseStmt = db.prepare(
    `INSERT INTO daily_liang_case
       (id, business_date, title, status, token_per_incense, liangzi_policy_version, created_at, opened_at, closed_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, NULL)`,
  )
  const updateActiveCaseTitleStmt = db.prepare(
    `UPDATE daily_liang_case SET title = ? WHERE id = ? AND status = 'active'`,
  )
  const closeOldCases = db.prepare(
    `UPDATE daily_liang_case SET status = 'closed', closed_at = ?
      WHERE status = 'active' AND business_date < ?`,
  )
  const closeActiveForDate = db.prepare(
    `UPDATE daily_liang_case SET status = 'closed', closed_at = ?
      WHERE status = 'active' AND business_date = ?`,
  )
  const resetUsedIncense = db.prepare(
    `UPDATE daily_incense_state
        SET used_incense = 0, version = version + 1, updated_at = ?
      WHERE business_date = ? AND used_incense > 0`,
  )
  const insertStats = db.prepare(
    `INSERT INTO daily_liang_stats (case_id, business_date, up_votes, down_votes, unique_voters, version, updated_at)
     VALUES (?, ?, 0, 0, 0, 0, ?)
     ON CONFLICT (case_id) DO NOTHING`,
  )
  const selectStats = db.prepare('SELECT * FROM daily_liang_stats WHERE case_id = ?')
  const bumpStats = db.prepare(
    `UPDATE daily_liang_stats
        SET up_votes = up_votes + ?,
            down_votes = down_votes + ?,
            unique_voters = unique_voters + ?,
            version = version + 1,
            updated_at = ?
      WHERE case_id = ?`,
  )
  const selectIncense = db.prepare(
    'SELECT * FROM daily_incense_state WHERE installation_id = ? AND business_date = ?',
  )
  const insertIncense = db.prepare(
    `INSERT INTO daily_incense_state
       (installation_id, business_date, claimed_effective_tokens, used_incense, token_per_incense,
        claim_source, version, created_at, updated_at)
     VALUES (?, ?, 0, 0, ?, ?, 0, ?, ?)
     ON CONFLICT (installation_id, business_date) DO NOTHING`,
  )
  // Monotonic ratchet: a smaller claim (restart, cleared host state, replay)
  // must never rewind an already-granted balance.
  const raiseClaimStmt = db.prepare(
    `UPDATE daily_incense_state
        SET claimed_effective_tokens = ?, version = version + 1, updated_at = ?
      WHERE installation_id = ? AND business_date = ? AND claimed_effective_tokens < ?`,
  )
  const insertStarterGrantStmt = db.prepare(
    `INSERT OR IGNORE INTO starter_incense_grant
       (device_fingerprint, business_date, installation_id, granted_tokens, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const addStarterTokensStmt = db.prepare(
    `UPDATE daily_incense_state
        SET claimed_effective_tokens = claimed_effective_tokens + ?,
            starter_tokens = starter_tokens + ?,
            version = version + 1,
            updated_at = ?
      WHERE installation_id = ? AND business_date = ?`,
  )
  // The affordability guard lives in the WHERE clause: integer arithmetic only,
  // no read-then-write window.
  const spendStmt = db.prepare(
    `UPDATE daily_incense_state
        SET used_incense = used_incense + ?, version = version + 1, updated_at = ?
      WHERE installation_id = ? AND business_date = ?
        AND (used_incense + ?) * token_per_incense <= claimed_effective_tokens`,
  )
  const selectVote = db.prepare(
    'SELECT * FROM liang_vote WHERE installation_id = ? AND request_id = ?',
  )
  const selectLastVoteAt = db.prepare(
    'SELECT MAX(created_at) AS last_at FROM liang_vote WHERE installation_id = ?',
  )
  const selectAnyVoteForCase = db.prepare(
    'SELECT 1 AS present FROM liang_vote WHERE case_id = ? AND installation_id = ? LIMIT 1',
  )
  const insertVoteStmt = db.prepare(
    `INSERT INTO liang_vote
       (request_id, installation_id, case_id, business_date, vote_type, requested_count,
        used_incense_after, remaining_incense_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectLatestSnapshot = db.prepare(
    'SELECT * FROM public_liang_snapshot WHERE case_id = ? ORDER BY sequence DESC LIMIT 1',
  )
  const insertSnapshotStmt = db.prepare(
    `INSERT INTO public_liang_snapshot
       (case_id, sequence, business_date, up_votes, down_votes, unique_voters, policy_version, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  // Bounded history: only the newest row is ever served (see config
  // SNAPSHOT_HISTORY_LIMIT); sequences stay monotonic, they just start later.
  const pruneSnapshotsStmt = db.prepare(
    `DELETE FROM public_liang_snapshot
      WHERE case_id = ? AND sequence <= (
        SELECT MAX(sequence) - ? FROM public_liang_snapshot WHERE case_id = ?
      )`,
  )
  const selectArchiveVersion = db.prepare(
    'SELECT archive_version FROM liang_archive_meta WHERE singleton = 1',
  )
  const bumpArchiveVersionStmt = db.prepare(
    'UPDATE liang_archive_meta SET archive_version = archive_version + 1 WHERE singleton = 1',
  )
  const selectUnarchivedCaseDates = db.prepare(
    `SELECT DISTINCT c.business_date AS business_date
       FROM daily_liang_case c
       LEFT JOIN liang_day_archive a ON a.business_date = c.business_date
      WHERE c.business_date < ? AND a.business_date IS NULL
      ORDER BY c.business_date`,
  )
  const selectArchiveCasesForDate = db.prepare(
    `SELECT c.title AS title,
            COALESCE(s.up_votes, 0) AS up_votes,
            COALESCE(s.down_votes, 0) AS down_votes
       FROM daily_liang_case c
       LEFT JOIN daily_liang_stats s ON s.case_id = c.id
      WHERE c.business_date = ?
      ORDER BY c.opened_at, c.id`,
  )
  const selectUniqueVoters = db.prepare(
    `SELECT COUNT(DISTINCT installation_id) AS n
       FROM liang_vote
      WHERE business_date >= ? AND business_date <= ?`,
  )
  const insertDayArchiveStmt = db.prepare(
    `INSERT INTO liang_day_archive
       (business_date, case_count, case_titles_json, up_votes, down_votes, unique_voters, finalized_at,
        archive_version, aggregation_policy_version, liangzi_policy_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertWeekArchiveStmt = db.prepare(
    `INSERT INTO liang_week_archive
       (week_id, start_date, end_date, covered_days, up_votes, down_votes, unique_voters, finalized_at,
        archive_version, aggregation_policy_version, liangzi_policy_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertMonthArchiveStmt = db.prepare(
    `INSERT INTO liang_month_archive
       (month_id, start_date, end_date, covered_days, up_votes, down_votes, unique_voters, finalized_at,
        archive_version, aggregation_policy_version, liangzi_policy_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectDayArchives = db.prepare(
    'SELECT * FROM liang_day_archive WHERE archive_version > ? ORDER BY business_date',
  )
  const selectWeekArchives = db.prepare(
    'SELECT * FROM liang_week_archive WHERE archive_version > ? ORDER BY start_date',
  )
  const selectMonthArchives = db.prepare(
    'SELECT * FROM liang_month_archive WHERE archive_version > ? ORDER BY start_date',
  )
  const deleteOldSnapshots = db.prepare(
    'DELETE FROM public_liang_snapshot WHERE business_date < ?',
  )
  const deleteOldVotes = db.prepare(
    'DELETE FROM liang_vote WHERE business_date < ?',
  )
  const deleteOldStats = db.prepare(
    'DELETE FROM daily_liang_stats WHERE business_date < ?',
  )
  const deleteOldCases = db.prepare(
    'DELETE FROM daily_liang_case WHERE business_date < ?',
  )
  const deleteDayArchives = db.prepare('DELETE FROM liang_day_archive')
  const deleteWeekArchives = db.prepare('DELETE FROM liang_week_archive')
  const deleteMonthArchives = db.prepare('DELETE FROM liang_month_archive')
  const resetArchiveVersion = db.prepare(
    'UPDATE liang_archive_meta SET archive_version = 0 WHERE singleton = 1',
  )
  const deleteVotesForDate = db.prepare(
    'DELETE FROM liang_vote WHERE business_date = ?',
  )
  const deleteSnapshotsForDate = db.prepare(
    'DELETE FROM public_liang_snapshot WHERE business_date = ?',
  )
  const deleteStatsForDate = db.prepare(
    'DELETE FROM daily_liang_stats WHERE business_date = ?',
  )
  const deleteClosedCasesForDate = db.prepare(
    `DELETE FROM daily_liang_case WHERE business_date = ? AND status = 'closed'`,
  )
  const revokeActiveAdmissionTicketsStmt = db.prepare(
    `UPDATE admission_ticket SET status = 'revoked' WHERE status = 'active'`,
  )
  const selectLatestBefore = db.prepare(
    `SELECT * FROM daily_liang_case
      WHERE business_date < ?
      ORDER BY business_date DESC, opened_at DESC
      LIMIT 1`,
  )
  const selectLifetimeIncense = db.prepare(
    `SELECT COALESCE(SUM(up_votes + down_votes), 0) AS incense FROM daily_liang_stats`,
  )
  const selectLifetimeVoters = db.prepare(
    `SELECT COUNT(DISTINCT installation_id) AS voters FROM liang_vote`,
  )
  const insertQueue = db.prepare(
    `INSERT INTO case_queue (title, publish_on, sort_order, created_at, consumed_at)
     VALUES (?, ?, COALESCE((SELECT MAX(sort_order) FROM case_queue), 0) + 1, ?, NULL)`,
  )
  const selectQueuePending = db.prepare(
    `SELECT * FROM case_queue WHERE consumed_at IS NULL
      ORDER BY CASE WHEN publish_on IS NULL THEN 1 ELSE 0 END, publish_on, sort_order`,
  )
  const deleteQueuePending = db.prepare('DELETE FROM case_queue WHERE consumed_at IS NULL')
  const selectQueueForDate = db.prepare(
    `SELECT * FROM case_queue
      WHERE consumed_at IS NULL AND publish_on IS NOT NULL AND publish_on <= ?
      ORDER BY publish_on, sort_order
      LIMIT 1`,
  )
  const selectQueueFifo = db.prepare(
    `SELECT * FROM case_queue
      WHERE consumed_at IS NULL AND publish_on IS NULL
      ORDER BY sort_order
      LIMIT 1`,
  )
  const consumeQueue = db.prepare(
    `UPDATE case_queue SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
  )
  const selectQueueById = db.prepare('SELECT * FROM case_queue WHERE id = ?')
  const selectIdentity = db.prepare(
    'SELECT * FROM community_identity WHERE installation_id = ?',
  )
  const selectIdentityByPublicKey = db.prepare(
    'SELECT * FROM community_identity WHERE public_key = ?',
  )
  const selectIdentityByFingerprint = db.prepare(
    'SELECT * FROM community_identity WHERE device_fingerprint = ?',
  )
  const upsertIdentityStmt = db.prepare(
    `INSERT INTO community_identity
       (installation_id, public_key, device_fingerprint, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (installation_id) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       device_fingerprint = COALESCE(community_identity.device_fingerprint, excluded.device_fingerprint)`,
  )
  const deleteIdentityStmt = db.prepare(
    'DELETE FROM community_identity WHERE installation_id = ?',
  )
  const insertAdmissionTicketStmt = db.prepare(
    `INSERT INTO admission_ticket
       (ticket_id, secret, max_claims, claimed_count, status, created_at, expires_at, last_claimed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectAdmissionTicketBySecret = db.prepare(
    'SELECT * FROM admission_ticket WHERE secret = ?',
  )
  const selectAvailableAdmissionTickets = db.prepare(
    `SELECT * FROM admission_ticket
      WHERE status = 'active' AND expires_at > ? AND claimed_count < max_claims
      ORDER BY created_at, ticket_id
      LIMIT ?`,
  )
  const consumeAdmissionTicketStmt = db.prepare(
    `UPDATE admission_ticket
        SET claimed_count = claimed_count + 1,
            status = CASE WHEN claimed_count + 1 >= max_claims THEN 'exhausted' ELSE 'active' END,
            last_claimed_at = ?
      WHERE secret = ? AND status = 'active' AND expires_at > ? AND claimed_count < max_claims`,
  )
  const expireAdmissionTicketsStmt = db.prepare(
    `UPDATE admission_ticket SET status = 'expired'
      WHERE status = 'active' AND expires_at <= ?`,
  )
  const revokeAdmissionTicketStmt = db.prepare(
    `UPDATE admission_ticket SET status = 'revoked'
      WHERE ticket_id = ? AND status = 'active'`,
  )
  const selectAdmissionInventory = db.prepare(
    `SELECT
       COUNT(*) AS total_tickets,
       COALESCE(SUM(CASE WHEN status = 'active' AND expires_at > ? AND claimed_count < max_claims THEN 1 ELSE 0 END), 0) AS active_tickets,
       COALESCE(SUM(CASE WHEN status = 'active' AND expires_at > ? THEN max_claims - claimed_count ELSE 0 END), 0) AS remaining_claims,
       COALESCE(SUM(CASE WHEN status = 'exhausted' THEN 1 ELSE 0 END), 0) AS exhausted_tickets,
       COALESCE(SUM(CASE WHEN status = 'expired' OR (status = 'active' AND expires_at <= ?) THEN 1 ELSE 0 END), 0) AS expired_tickets,
       COALESCE(SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END), 0) AS revoked_tickets
     FROM admission_ticket`,
  )

  return {
    transaction<T>(body: () => T): T {
      db.exec('BEGIN IMMEDIATE')
      try {
        const value = body()
        db.exec('COMMIT')
        return value
      } catch (error) {
        try {
          db.exec('ROLLBACK')
        } catch {
          // A failed rollback means the transaction was already resolved.
        }
        throw error
      }
    },
    activeCaseFor: (businessDate) => selectActiveCase.get(businessDate) as CaseRow | undefined,
    caseById: (caseId) => selectCaseById.get(caseId) as CaseRow | undefined,
    insertCase(input) {
      insertCaseStmt.run(
        input.id,
        input.businessDate,
        input.title,
        input.tokenPerIncense,
        input.liangziPolicyVersion,
        input.now,
        input.now,
      )
      insertStats.run(input.id, input.businessDate, input.now)
    },
    updateActiveCaseTitle: (caseId, title) => changed(updateActiveCaseTitleStmt.run(title, caseId)) > 0,
    closeCasesBefore: (businessDate, now) => changed(closeOldCases.run(now, businessDate)),
    closeActiveCaseFor: (businessDate, now) => changed(closeActiveForDate.run(now, businessDate)),
    resetUsedIncenseForDate: (businessDate, now) => changed(resetUsedIncense.run(now, businessDate)),
    statsFor: (caseId) => selectStats.get(caseId) as StatsRow | undefined,
    incenseFor: (installationId, businessDate) =>
      selectIncense.get(installationId, businessDate) as IncenseRow | undefined,
    ensureIncenseRow(installationId, businessDate, tokenPerIncense, claimSource, now) {
      insertIncense.run(installationId, businessDate, tokenPerIncense, claimSource, now, now)
    },
    raiseClaim: (installationId, businessDate, claimed, now) =>
      changed(raiseClaimStmt.run(claimed, now, installationId, businessDate, claimed)) > 0,
    tryInsertStarterGrant: (fingerprint, businessDate, installationId, grantedTokens, now) =>
      changed(insertStarterGrantStmt.run(fingerprint, businessDate, installationId, grantedTokens, now)) > 0,
    addStarterTokens: (installationId, businessDate, tokens, now) =>
      changed(addStarterTokensStmt.run(tokens, tokens, now, installationId, businessDate)) > 0,
    spendOneIncense: (installationId, businessDate, now) =>
      changed(spendStmt.run(1, now, installationId, businessDate, 1)) > 0,
    spendIncense: (installationId, businessDate, count, now) =>
      count >= 1 && changed(spendStmt.run(count, now, installationId, businessDate, count)) > 0,
    voteByRequestId: (installationId, requestId) =>
      selectVote.get(installationId, requestId) as VoteRow | undefined,
    lastAcceptedVoteAt(installationId) {
      const row = selectLastVoteAt.get(installationId) as { last_at: number | bigint | null } | undefined
      if (row?.last_at == null) return null
      return Number(row.last_at)
    },
    hasVotedForCase: (installationId, caseId) =>
      selectAnyVoteForCase.get(caseId, installationId) !== undefined,
    insertVote(row) {
      insertVoteStmt.run(
        row.request_id,
        row.installation_id,
        row.case_id,
        row.business_date,
        row.vote_type,
        row.requested_count,
        row.used_incense_after,
        row.remaining_incense_after,
        row.created_at,
      )
    },
    applyAcceptedVoteToStats(caseId, voteType, count, firstVoter, now) {
      bumpStats.run(
        voteType === 'up' ? count : 0,
        voteType === 'down' ? count : 0,
        firstVoter ? 1 : 0,
        now,
        caseId,
      )
    },
    latestSnapshot: (caseId) => selectLatestSnapshot.get(caseId) as SnapshotRow | undefined,
    insertSnapshot(row) {
      insertSnapshotStmt.run(
        row.case_id,
        row.sequence,
        row.business_date,
        row.up_votes,
        row.down_votes,
        row.unique_voters,
        row.policy_version,
        row.captured_at,
      )
    },
    pruneSnapshots: (caseId, keep) => changed(pruneSnapshotsStmt.run(caseId, keep, caseId)),
    archiveVersion() {
      const row = selectArchiveVersion.get() as { archive_version: number | bigint } | undefined
      return Number(row?.archive_version ?? 0)
    },
    bumpArchiveVersion() {
      bumpArchiveVersionStmt.run()
      const row = selectArchiveVersion.get() as { archive_version: number | bigint } | undefined
      if (row === undefined) throw new Error('archive metadata row is missing')
      return Number(row.archive_version)
    },
    unarchivedCaseDatesBefore(businessDate) {
      const rows = selectUnarchivedCaseDates.all(businessDate) as unknown as Array<{ business_date: string }>
      return rows.map(row => row.business_date)
    },
    countUniqueVoters(startDate, endDate) {
      const row = selectUniqueVoters.get(startDate, endDate) as { n: number | bigint } | undefined
      return Number(row?.n ?? 0)
    },
    dayArchiveSource(businessDate) {
      const rows = selectArchiveCasesForDate.all(businessDate) as unknown as Array<{
        title: string
        up_votes: number | bigint
        down_votes: number | bigint
      }>
      if (rows.length === 0) return undefined
      return {
        businessDate,
        caseTitles: rows.map(row => row.title),
        upVotes: rows.reduce((sum, row) => sum + Number(row.up_votes), 0),
        downVotes: rows.reduce((sum, row) => sum + Number(row.down_votes), 0),
        uniqueVoters: this.countUniqueVoters(businessDate, businessDate),
      }
    },
    insertDayArchive(row) {
      insertDayArchiveStmt.run(
        row.business_date,
        row.case_count,
        row.case_titles_json,
        row.up_votes,
        row.down_votes,
        row.unique_voters,
        row.finalized_at,
        row.archive_version,
        row.aggregation_policy_version,
        row.liangzi_policy_version,
      )
    },
    insertWeekArchive(row) {
      insertWeekArchiveStmt.run(
        row.week_id,
        row.start_date,
        row.end_date,
        row.covered_days,
        row.up_votes,
        row.down_votes,
        row.unique_voters,
        row.finalized_at,
        row.archive_version,
        row.aggregation_policy_version,
        row.liangzi_policy_version,
      )
    },
    insertMonthArchive(row) {
      insertMonthArchiveStmt.run(
        row.month_id,
        row.start_date,
        row.end_date,
        row.covered_days,
        row.up_votes,
        row.down_votes,
        row.unique_voters,
        row.finalized_at,
        row.archive_version,
        row.aggregation_policy_version,
        row.liangzi_policy_version,
      )
    },
    dayArchives: (afterVersion = -1) =>
      selectDayArchives.all(afterVersion) as unknown as DayArchiveRow[],
    weekArchives: (afterVersion = -1) =>
      selectWeekArchives.all(afterVersion) as unknown as WeekArchiveRow[],
    monthArchives: (afterVersion = -1) =>
      selectMonthArchives.all(afterVersion) as unknown as MonthArchiveRow[],
    clearHistoryArchives(keepBusinessDate) {
      deleteOldSnapshots.run(keepBusinessDate)
      deleteOldVotes.run(keepBusinessDate)
      deleteOldStats.run(keepBusinessDate)
      const closedCases = changed(deleteOldCases.run(keepBusinessDate))
      const days = changed(deleteDayArchives.run())
      const weeks = changed(deleteWeekArchives.run())
      const months = changed(deleteMonthArchives.run())
      resetArchiveVersion.run()
      return { days, weeks, months, closedCases }
    },
    resetBusinessDate(businessDate, now) {
      const votes = changed(deleteVotesForDate.run(businessDate))
      deleteSnapshotsForDate.run(businessDate)
      deleteStatsForDate.run(businessDate)
      const closedCases = changed(deleteClosedCasesForDate.run(businessDate))
      const incenseRows = this.resetUsedIncenseForDate(businessDate, now)
      const active = this.activeCaseFor(businessDate)
      if (active !== undefined) {
        insertStats.run(active.id, businessDate, now)
        insertSnapshotStmt.run(
          active.id,
          1,
          businessDate,
          0,
          0,
          0,
          active.liangzi_policy_version,
          now,
        )
      }
      return { votes, closedCases, incenseRows, activeCaseId: active?.id }
    },
    identityByInstallation: (installationId) =>
      selectIdentity.get(installationId) as CommunityIdentityRow | undefined,
    identityByPublicKey: (publicKey) =>
      selectIdentityByPublicKey.get(publicKey) as CommunityIdentityRow | undefined,
    identityByFingerprint: (fingerprint) =>
      selectIdentityByFingerprint.get(fingerprint) as CommunityIdentityRow | undefined,
    upsertIdentity(row) {
      upsertIdentityStmt.run(
        row.installation_id,
        row.public_key,
        row.device_fingerprint,
        row.created_at,
        row.last_seen_at,
      )
    },
    deleteIdentity: (installationId) => changed(deleteIdentityStmt.run(installationId)) > 0,
    insertAdmissionTicket(row) {
      insertAdmissionTicketStmt.run(
        row.ticket_id,
        row.secret,
        row.max_claims,
        row.claimed_count,
        row.status,
        row.created_at,
        row.expires_at,
        row.last_claimed_at,
      )
    },
    admissionTicketBySecret: (secret) =>
      selectAdmissionTicketBySecret.get(secret) as AdmissionTicketRow | undefined,
    availableAdmissionTickets: (now, limit) =>
      selectAvailableAdmissionTickets.all(now, limit) as unknown as AdmissionTicketRow[],
    consumeAdmissionTicket: (secret, now) =>
      changed(consumeAdmissionTicketStmt.run(now, secret, now)) > 0,
    expireAdmissionTickets: (now) => changed(expireAdmissionTicketsStmt.run(now)),
    revokeAdmissionTicket: (ticketId) => changed(revokeAdmissionTicketStmt.run(ticketId)) > 0,
    revokeActiveAdmissionTickets: () => changed(revokeActiveAdmissionTicketsStmt.run()),
    admissionInventory(now) {
      const row = selectAdmissionInventory.get(now, now, now) as {
        active_tickets: number | bigint
        remaining_claims: number | bigint
        exhausted_tickets: number | bigint
        expired_tickets: number | bigint
        revoked_tickets: number | bigint
        total_tickets: number | bigint
      }
      return {
        activeTickets: Number(row.active_tickets),
        remainingClaims: Number(row.remaining_claims),
        exhaustedTickets: Number(row.exhausted_tickets),
        expiredTickets: Number(row.expired_tickets),
        revokedTickets: Number(row.revoked_tickets),
        totalTickets: Number(row.total_tickets),
      }
    },
    latestCaseBefore: (businessDate) => selectLatestBefore.get(businessDate) as CaseRow | undefined,
    lifetimeTotals() {
      const incenseRow = selectLifetimeIncense.get() as { incense: number | bigint } | undefined
      const voterRow = selectLifetimeVoters.get() as { voters: number | bigint } | undefined
      return {
        incense: Number(incenseRow?.incense ?? 0),
        voters: Number(voterRow?.voters ?? 0),
      }
    },
    enqueueCase(title, publishOn, now) {
      const result = insertQueue.run(title, publishOn, now)
      const id = Number(result.lastInsertRowid)
      const row = selectQueueById.get(id) as QueueRow | undefined
      if (row === undefined) throw new Error('failed to enqueue case')
      return row
    },
    pendingQueue: () => selectQueuePending.all() as unknown as QueueRow[],
    clearPendingQueue: () => changed(deleteQueuePending.run()),
    takeQueuedTitle(today, now) {
      const dated = selectQueueForDate.get(today) as QueueRow | undefined
      const row = dated ?? selectQueueFifo.get() as QueueRow | undefined
      if (row === undefined) return undefined
      if (changed(consumeQueue.run(now, row.id)) === 0) return undefined
      return row.title
    },
    close: () => db.close(),
  }
}
