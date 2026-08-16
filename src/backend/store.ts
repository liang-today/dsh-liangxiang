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

export interface CommunityIdentityRow {
  installation_id: string
  public_key: string
  device_fingerprint: string | null
  created_at: number
  last_seen_at: number
}

export interface VoteRow {
  id: number
  request_id: string
  installation_id: string
  case_id: string
  business_date: string
  vote_type: VoteType
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
  /** Conditional spend; false means unaffordable/lost race (no row changed). */
  spendOneIncense: (installationId: string, businessDate: string, now: number) => boolean
  voteByRequestId: (installationId: string, requestId: string) => VoteRow | undefined
  hasVotedForCase: (installationId: string, caseId: string) => boolean
  insertVote: (row: Omit<VoteRow, 'id'>) => void
  applyAcceptedVoteToStats: (caseId: string, voteType: VoteType, firstVoter: boolean, now: number) => void
  latestSnapshot: (caseId: string) => SnapshotRow | undefined
  insertSnapshot: (row: SnapshotRow) => void
  /** Drop all but the newest `keep` snapshots of one case; returns rows deleted. */
  pruneSnapshots: (caseId: string, keep: number) => number
  identityByInstallation: (installationId: string) => CommunityIdentityRow | undefined
  identityByFingerprint: (fingerprint: string) => CommunityIdentityRow | undefined
  /**
   * Insert or refresh last_seen. Throws SQLITE unique on a fingerprint already
   * bound to a different installation.
   */
  upsertIdentity: (row: CommunityIdentityRow) => void
  close: () => void
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
  // The affordability guard lives in the WHERE clause: integer arithmetic only,
  // no read-then-write window.
  const spendStmt = db.prepare(
    `UPDATE daily_incense_state
        SET used_incense = used_incense + 1, version = version + 1, updated_at = ?
      WHERE installation_id = ? AND business_date = ?
        AND (used_incense + 1) * token_per_incense <= claimed_effective_tokens`,
  )
  const selectVote = db.prepare(
    'SELECT * FROM liang_vote WHERE installation_id = ? AND request_id = ?',
  )
  const selectAnyVoteForCase = db.prepare(
    'SELECT 1 AS present FROM liang_vote WHERE case_id = ? AND installation_id = ? LIMIT 1',
  )
  const insertVoteStmt = db.prepare(
    `INSERT INTO liang_vote
       (request_id, installation_id, case_id, business_date, vote_type,
        used_incense_after, remaining_incense_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
  const selectIdentity = db.prepare(
    'SELECT * FROM community_identity WHERE installation_id = ?',
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
    spendOneIncense: (installationId, businessDate, now) =>
      changed(spendStmt.run(now, installationId, businessDate)) > 0,
    voteByRequestId: (installationId, requestId) =>
      selectVote.get(installationId, requestId) as VoteRow | undefined,
    hasVotedForCase: (installationId, caseId) =>
      selectAnyVoteForCase.get(caseId, installationId) !== undefined,
    insertVote(row) {
      insertVoteStmt.run(
        row.request_id,
        row.installation_id,
        row.case_id,
        row.business_date,
        row.vote_type,
        row.used_incense_after,
        row.remaining_incense_after,
        row.created_at,
      )
    },
    applyAcceptedVoteToStats(caseId, voteType, firstVoter, now) {
      bumpStats.run(
        voteType === 'up' ? 1 : 0,
        voteType === 'down' ? 1 : 0,
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
    identityByInstallation: (installationId) =>
      selectIdentity.get(installationId) as CommunityIdentityRow | undefined,
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
    close: () => db.close(),
  }
}
