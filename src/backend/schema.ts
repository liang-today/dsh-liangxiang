/**
 * SQLite schema (v16) for the Liangxiang backend.
 *
 * Design notes that matter for the frozen invariants:
 *
 *  - `daily_liang_case`: at most ONE active case per business date, enforced by
 *    a partial unique index rather than by application code. Operators may
 *    archive today's case and open another (same-day republish); the index
 *    still refuses two actives. The first lazy-open id is `case-YYYY-MM-DD`;
 *    later publishes use `case-YYYY-MM-DD-<hex>`.
 *  - `daily_incense_state`: daily usage/spend statistics. Since v12 the
 *    nonnegative cumulative `incense_wallet` owns spend authority; a user can
 *    legitimately spend yesterday's incense or an earlier market payout.
 *  - `liang_vote_request`: the durable idempotency receipt for every valid
 *    vote intent, accepted or rejected. The complete normalized payload and
 *    rejected business result are persisted so later balance/case changes
 *    cannot turn a retry into a different outcome. `liang_vote` remains the
 *    accepted-vote ledger used for spend/audit/aggregation only.
 *  - `daily_liang_stats`: the raw aggregate, updated inside the vote
 *    transaction (immediately consistent).
 *  - `public_liang_snapshot`: append-only published snapshots. Ratios and
 *    Liangzi state are NOT stored — they are derived from one snapshot row by
 *    the same domain policy the UI uses, so they cannot come from different
 *    versions (AGENTS.md §12). The stored `policy_version` records which
 *    threshold policy the row was published under.
 *
 * Ratios/state deliberately have no columns; adding them would create a second
 * source of truth for something the domain already derives.
 */
import type { DatabaseSync } from 'node:sqlite'
import { VOTE_COUNT_MAX } from '../domain/index.ts'

export const BACKEND_SCHEMA_USER_VERSION = 16

const DDL = `
CREATE TABLE IF NOT EXISTS daily_liang_case (
  id                      TEXT    PRIMARY KEY,
  business_date           TEXT    NOT NULL,
  title                   TEXT    NOT NULL,
  status                  TEXT    NOT NULL CHECK (status IN ('active', 'closed')),
  token_per_incense       INTEGER NOT NULL CHECK (token_per_incense > 0),
  liangzi_policy_version  TEXT    NOT NULL,
  created_at              INTEGER NOT NULL,
  opened_at               INTEGER NOT NULL,
  closed_at               INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_case_one_active_per_date
  ON daily_liang_case (business_date) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS daily_incense_state (
  installation_id           TEXT    NOT NULL,
  business_date             TEXT    NOT NULL,
  claimed_effective_tokens  INTEGER NOT NULL DEFAULT 0 CHECK (claimed_effective_tokens >= 0),
  used_incense              INTEGER NOT NULL DEFAULT 0 CHECK (used_incense >= 0),
  token_per_incense         INTEGER NOT NULL CHECK (token_per_incense > 0),
  claim_source              TEXT    NOT NULL,
  version                   INTEGER NOT NULL DEFAULT 0,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  PRIMARY KEY (installation_id, business_date),
  CHECK (used_incense * token_per_incense <= claimed_effective_tokens)
);

CREATE TABLE IF NOT EXISTS liang_vote (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id               TEXT    NOT NULL,
  installation_id          TEXT    NOT NULL,
  case_id                  TEXT    NOT NULL REFERENCES daily_liang_case (id),
  business_date            TEXT    NOT NULL,
  vote_type                TEXT    NOT NULL CHECK (vote_type IN ('up', 'down')),
  requested_count          INTEGER CHECK (requested_count IS NULL OR requested_count > 0),
  used_incense_after       INTEGER NOT NULL CHECK (used_incense_after > 0),
  remaining_incense_after  INTEGER NOT NULL CHECK (remaining_incense_after >= 0),
  created_at               INTEGER NOT NULL,
  UNIQUE (installation_id, request_id)
);

CREATE INDEX IF NOT EXISTS ix_vote_case_installation
  ON liang_vote (case_id, installation_id);

CREATE TABLE IF NOT EXISTS daily_liang_stats (
  case_id        TEXT    PRIMARY KEY REFERENCES daily_liang_case (id),
  business_date  TEXT    NOT NULL,
  up_votes       INTEGER NOT NULL DEFAULT 0 CHECK (up_votes >= 0),
  down_votes     INTEGER NOT NULL DEFAULT 0 CHECK (down_votes >= 0),
  unique_voters  INTEGER NOT NULL DEFAULT 0 CHECK (unique_voters >= 0),
  version        INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  CHECK (unique_voters <= up_votes + down_votes)
);

CREATE TABLE IF NOT EXISTS public_liang_snapshot (
  case_id         TEXT    NOT NULL REFERENCES daily_liang_case (id),
  sequence        INTEGER NOT NULL CHECK (sequence > 0),
  business_date   TEXT    NOT NULL,
  up_votes        INTEGER NOT NULL CHECK (up_votes >= 0),
  down_votes      INTEGER NOT NULL CHECK (down_votes >= 0),
  unique_voters   INTEGER NOT NULL CHECK (unique_voters >= 0),
  policy_version  TEXT    NOT NULL,
  captured_at     INTEGER NOT NULL,
  PRIMARY KEY (case_id, sequence)
);
`

const DDL_V2 = `
CREATE TABLE IF NOT EXISTS community_identity (
  installation_id     TEXT    PRIMARY KEY,
  public_key          TEXT    NOT NULL UNIQUE,
  device_fingerprint  TEXT    UNIQUE,
  created_at          INTEGER NOT NULL,
  last_seen_at        INTEGER NOT NULL
);
`

const DDL_V3 = `
CREATE TABLE IF NOT EXISTS case_queue (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  publish_on   TEXT,
  sort_order   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  consumed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS ix_case_queue_pending
  ON case_queue (consumed_at, publish_on, sort_order);
`

const DDL_V4 = `
CREATE TABLE IF NOT EXISTS liang_archive_meta (
  singleton        INTEGER PRIMARY KEY CHECK (singleton = 1),
  archive_version  INTEGER NOT NULL DEFAULT 0 CHECK (archive_version >= 0)
);
INSERT INTO liang_archive_meta (singleton, archive_version)
VALUES (1, 0)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS liang_day_archive (
  business_date               TEXT    PRIMARY KEY,
  case_count                   INTEGER NOT NULL CHECK (case_count > 0),
  case_titles_json             TEXT    NOT NULL,
  up_votes                     INTEGER NOT NULL CHECK (up_votes >= 0),
  down_votes                   INTEGER NOT NULL CHECK (down_votes >= 0),
  finalized_at                 INTEGER NOT NULL,
  archive_version              INTEGER NOT NULL CHECK (archive_version > 0),
  aggregation_policy_version   TEXT    NOT NULL,
  liangzi_policy_version       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_day_archive_version
  ON liang_day_archive (archive_version, business_date);

CREATE TABLE IF NOT EXISTS liang_week_archive (
  week_id                      TEXT    PRIMARY KEY,
  start_date                   TEXT    NOT NULL,
  end_date                     TEXT    NOT NULL,
  covered_days                 INTEGER NOT NULL CHECK (covered_days > 0),
  up_votes                     INTEGER NOT NULL CHECK (up_votes >= 0),
  down_votes                   INTEGER NOT NULL CHECK (down_votes >= 0),
  finalized_at                 INTEGER NOT NULL,
  archive_version              INTEGER NOT NULL CHECK (archive_version > 0),
  aggregation_policy_version   TEXT    NOT NULL,
  liangzi_policy_version       TEXT    NOT NULL,
  UNIQUE (start_date, end_date)
);
CREATE INDEX IF NOT EXISTS ix_week_archive_version
  ON liang_week_archive (archive_version, start_date);

CREATE TABLE IF NOT EXISTS liang_month_archive (
  month_id                     TEXT    PRIMARY KEY,
  start_date                   TEXT    NOT NULL,
  end_date                     TEXT    NOT NULL,
  covered_days                 INTEGER NOT NULL CHECK (covered_days > 0),
  up_votes                     INTEGER NOT NULL CHECK (up_votes >= 0),
  down_votes                   INTEGER NOT NULL CHECK (down_votes >= 0),
  finalized_at                 INTEGER NOT NULL,
  archive_version              INTEGER NOT NULL CHECK (archive_version > 0),
  aggregation_policy_version   TEXT    NOT NULL,
  liangzi_policy_version       TEXT    NOT NULL,
  UNIQUE (start_date, end_date)
);
CREATE INDEX IF NOT EXISTS ix_month_archive_version
  ON liang_month_archive (archive_version, start_date);
`

const DDL_V5 = `
CREATE TABLE IF NOT EXISTS admission_ticket (
  ticket_id        TEXT    PRIMARY KEY,
  secret           TEXT    NOT NULL UNIQUE,
  max_claims       INTEGER NOT NULL CHECK (max_claims > 0),
  claimed_count    INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0 AND claimed_count <= max_claims),
  status           TEXT    NOT NULL CHECK (status IN ('active', 'exhausted', 'revoked', 'expired')),
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL CHECK (expires_at > created_at),
  last_claimed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS ix_admission_ticket_inventory
  ON admission_ticket (status, expires_at, created_at);
`

const DDL_V6_GRANT = `
CREATE TABLE IF NOT EXISTS starter_incense_grant (
  device_fingerprint  TEXT    NOT NULL,
  business_date       TEXT    NOT NULL,
  installation_id     TEXT    NOT NULL,
  granted_tokens      INTEGER NOT NULL CHECK (granted_tokens > 0),
  created_at          INTEGER NOT NULL,
  PRIMARY KEY (device_fingerprint, business_date)
);
CREATE INDEX IF NOT EXISTS ix_starter_grant_install
  ON starter_incense_grant (installation_id, business_date);
`

const DDL_V9_REQUEST_RECEIPT = `
CREATE TABLE IF NOT EXISTS liang_vote_request (
  installation_id    TEXT    NOT NULL,
  request_id          TEXT    NOT NULL,
  case_id             TEXT    NOT NULL,
  business_date       TEXT    NOT NULL,
  vote_type           TEXT    NOT NULL CHECK (vote_type IN ('up', 'down')),
  requested_count     INTEGER CHECK (
    requested_count IS NULL OR requested_count BETWEEN 1 AND ${VOTE_COUNT_MAX}
  ),
  result_status       TEXT    NOT NULL CHECK (result_status IN ('accepted', 'rejected')),
  rejection_reason    TEXT CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'insufficient_incense', 'case_not_active', 'stale_case',
    'idempotency_conflict', 'invalid_intent'
  )),
  rejection_message   TEXT,
  created_at          INTEGER NOT NULL,
  PRIMARY KEY (installation_id, request_id),
  CHECK (
    (result_status = 'accepted' AND rejection_reason IS NULL AND rejection_message IS NULL)
    OR
    (result_status = 'rejected' AND requested_count IS NOT NULL
      AND rejection_reason IS NOT NULL AND rejection_message IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_vote_request_business_date
  ON liang_vote_request (business_date, installation_id);

-- A prior failed development migration must not leave a partial receipt set.
-- Official migrations are transactional, so this is normally a no-op.
DELETE FROM liang_vote_request;
INSERT INTO liang_vote_request
  (installation_id, request_id, case_id, business_date, vote_type, requested_count,
   result_status, rejection_reason, rejection_message, created_at)
SELECT installation_id, request_id, case_id, business_date, vote_type, requested_count,
       'accepted', NULL, NULL, created_at
  FROM liang_vote;
`

const DDL_V10_BROADCAST = `
CREATE TABLE IF NOT EXISTS client_broadcast (
  singleton   INTEGER PRIMARY KEY CHECK (singleton = 1),
  id          TEXT    NOT NULL,
  level       TEXT    NOT NULL CHECK (level IN ('important', 'emergency')),
  message     TEXT    NOT NULL,
  starts_at   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL CHECK (expires_at > starts_at),
  updated_at  INTEGER NOT NULL
);
`

const DDL_V12_WALLET_MARKET = `
-- Daily rows remain statistics. Affordability now belongs to one durable wallet.
CREATE TABLE daily_incense_state_v12 (
  installation_id TEXT NOT NULL, business_date TEXT NOT NULL,
  claimed_effective_tokens INTEGER NOT NULL DEFAULT 0 CHECK (claimed_effective_tokens >= 0),
  used_incense INTEGER NOT NULL DEFAULT 0 CHECK (used_incense >= 0),
  token_per_incense INTEGER NOT NULL CHECK (token_per_incense > 0),
  claim_source TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  starter_tokens INTEGER NOT NULL DEFAULT 0 CHECK (starter_tokens >= 0),
  PRIMARY KEY (installation_id, business_date)
);
INSERT INTO daily_incense_state_v12 SELECT installation_id, business_date,
  claimed_effective_tokens, used_incense, token_per_incense, claim_source,
  version, created_at, updated_at, starter_tokens FROM daily_incense_state;
DROP TABLE daily_incense_state;
ALTER TABLE daily_incense_state_v12 RENAME TO daily_incense_state;

CREATE TABLE IF NOT EXISTS incense_wallet (
  installation_id TEXT PRIMARY KEY,
  available INTEGER NOT NULL CHECK (available >= 0),
  frozen INTEGER NOT NULL CHECK (frozen >= 0),
  token_remainder INTEGER NOT NULL CHECK (token_remainder >= 0),
  token_per_incense INTEGER NOT NULL CHECK (token_per_incense > 0),
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  CHECK (token_remainder < token_per_incense),
  CHECK (available + frozen <= 9007199254740991)
);
CREATE TABLE IF NOT EXISTS incense_wallet_cursor (
  installation_id TEXT NOT NULL, business_date TEXT NOT NULL,
  claimed_tokens INTEGER NOT NULL CHECK (claimed_tokens >= 0),
  minted_incense INTEGER NOT NULL CHECK (minted_incense >= 0),
  PRIMARY KEY (installation_id, business_date)
);
CREATE TABLE IF NOT EXISTS incense_wallet_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id TEXT NOT NULL, reference TEXT NOT NULL, kind TEXT NOT NULL,
  available_delta INTEGER NOT NULL, frozen_delta INTEGER NOT NULL,
  business_date TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE (installation_id, reference)
);
CREATE INDEX IF NOT EXISTS ix_wallet_entry_identity ON incense_wallet_entry(installation_id, id);

CREATE TABLE IF NOT EXISTS liang_market (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL UNIQUE, business_date TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL, opens_at INTEGER NOT NULL, closes_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','closed','cancelled')),
  close_point TEXT, created_at INTEGER NOT NULL, settled_at INTEGER, version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS liang_market_batch (
  market_id TEXT NOT NULL REFERENCES liang_market(id), batch INTEGER NOT NULL CHECK (batch BETWEEN 1 AND 3),
  opens_at INTEGER NOT NULL, locks_at INTEGER NOT NULL, reference_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','open','locked','live','settled','void')),
  reference_point TEXT, result TEXT CHECK (result IN ('long','short','draw','void')),
  PRIMARY KEY(market_id,batch)
);
CREATE TABLE IF NOT EXISTS liang_market_position (
  id INTEGER PRIMARY KEY AUTOINCREMENT, market_id TEXT NOT NULL, batch INTEGER NOT NULL,
  installation_id TEXT NOT NULL, side TEXT NOT NULL CHECK (side IN ('long','short')),
  amount INTEGER NOT NULL CHECK (amount >= 0), payout INTEGER CHECK (payout >= 0),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(market_id,batch,installation_id),
  FOREIGN KEY(market_id,batch) REFERENCES liang_market_batch(market_id,batch)
);
CREATE INDEX IF NOT EXISTS ix_market_position_owner ON liang_market_position(installation_id,market_id);
CREATE TABLE IF NOT EXISTS liang_market_request (
  installation_id TEXT NOT NULL, request_id TEXT NOT NULL, payload TEXT NOT NULL,
  accepted INTEGER NOT NULL CHECK (accepted IN (0,1)), reason TEXT,
  created_at INTEGER NOT NULL, PRIMARY KEY(installation_id,request_id)
);
CREATE TABLE IF NOT EXISTS liang_market_receipt (
  id INTEGER PRIMARY KEY AUTOINCREMENT, installation_id TEXT NOT NULL,
  market_id TEXT NOT NULL, receipt_json TEXT NOT NULL, settled_at INTEGER NOT NULL,
  UNIQUE(installation_id,market_id)
);
CREATE INDEX IF NOT EXISTS ix_market_receipt_owner ON liang_market_receipt(installation_id,id DESC);
CREATE TABLE IF NOT EXISTS liang_market_candle (
  case_id TEXT NOT NULL, business_date TEXT NOT NULL, at INTEGER NOT NULL,
  open REAL, high REAL, low REAL, close REAL,
  up_votes INTEGER NOT NULL, down_votes INTEGER NOT NULL,
  volume INTEGER NOT NULL CHECK (volume >= 0),
  PRIMARY KEY(case_id,at)
);
CREATE INDEX IF NOT EXISTS ix_market_candle_date ON liang_market_candle(business_date,at);
`

/** Keep historical five-minute candles intact; a finer series starts on upgrade. */
const DDL_V14_MINUTE_CANDLES = `
CREATE TABLE IF NOT EXISTS liang_market_minute_candle (
  case_id TEXT NOT NULL, business_date TEXT NOT NULL, at INTEGER NOT NULL,
  open REAL, high REAL, low REAL, close REAL,
  up_votes INTEGER NOT NULL, down_votes INTEGER NOT NULL,
  volume INTEGER NOT NULL CHECK (volume >= 0),
  PRIMARY KEY(case_id,at)
);
CREATE INDEX IF NOT EXISTS ix_market_minute_candle_date ON liang_market_minute_candle(business_date,at);
`

function tableColumns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((row) => row.name)
}

/** Apply the schema and record its user_version (idempotent). */
export function migrate(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('BEGIN IMMEDIATE')
  try {
    // Read only after acquiring the writer lock: a concurrent upgrader may
    // have completed while this connection waited for BEGIN IMMEDIATE.
    const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
    const current = typeof row?.user_version === 'number' ? row.user_version : 0
    if (current > BACKEND_SCHEMA_USER_VERSION) {
      throw new Error(`liangxiang backend database is at schema version ${current}, newer than this build (${BACKEND_SCHEMA_USER_VERSION})`)
    }
    db.exec(DDL)
    if (current < 2) db.exec(DDL_V2)
    if (current < 3) db.exec(DDL_V3)
    if (current < 4) db.exec(DDL_V4)
    if (current < 5) db.exec(DDL_V5)
    if (current < 6) {
      db.exec(DDL_V6_GRANT)
      if (!tableColumns(db, 'daily_incense_state').includes('starter_tokens')) {
        db.exec('ALTER TABLE daily_incense_state ADD COLUMN starter_tokens INTEGER NOT NULL DEFAULT 0')
      }
    }
    if (current < 7) {
      for (const table of ['liang_day_archive', 'liang_week_archive', 'liang_month_archive'] as const) {
        if (!tableColumns(db, table).includes('unique_voters')) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN unique_voters INTEGER NOT NULL DEFAULT 0`)
        }
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS ix_vote_business_date
          ON liang_vote (business_date, installation_id);
        UPDATE liang_day_archive SET unique_voters = (
          SELECT COUNT(DISTINCT installation_id) FROM liang_vote v
           WHERE v.business_date = liang_day_archive.business_date
        );
        UPDATE liang_week_archive SET unique_voters = (
          SELECT COUNT(DISTINCT installation_id) FROM liang_vote v
           WHERE v.business_date >= liang_week_archive.start_date
             AND v.business_date <= liang_week_archive.end_date
        );
        UPDATE liang_month_archive SET unique_voters = (
          SELECT COUNT(DISTINCT installation_id) FROM liang_vote v
           WHERE v.business_date >= liang_month_archive.start_date
             AND v.business_date <= liang_month_archive.end_date
        );
      `)
    }
    if (current < 8 && !tableColumns(db, 'liang_vote').includes('requested_count')) {
      // V7 did not persist the requested dump size. It cannot be reconstructed
      // from the accepted spend because remaining incense and the rate budget
      // may have clamped it. Keep legacy rows NULL and let the service accept
      // only the canonical one-stick replay for those ambiguous records.
      db.exec(
        'ALTER TABLE liang_vote ADD COLUMN requested_count INTEGER '
        + 'CHECK (requested_count IS NULL OR requested_count > 0)',
      )
    }
    if (current < 9) db.exec(DDL_V9_REQUEST_RECEIPT)
    if (current < 10) db.exec(DDL_V10_BROADCAST)
    if (current < 11 && !tableColumns(db, 'liang_vote').includes('accepted_incense')) {
      db.exec(`ALTER TABLE liang_vote ADD COLUMN accepted_incense INTEGER
        CHECK (accepted_incense IS NULL OR accepted_incense BETWEEN 1 AND ${VOTE_COUNT_MAX})`)
    }
    if (current < 12) {
      // Some early development snapshots stamped v7/v8 with only the vote
      // table present. DDL above can create their base daily table today; it
      // still needs the optional v6 column before the v12 copy is compiled.
      db.exec(DDL_V6_GRANT)
      if (!tableColumns(db, 'daily_incense_state').includes('starter_tokens')) {
        db.exec('ALTER TABLE daily_incense_state ADD COLUMN starter_tokens INTEGER NOT NULL DEFAULT 0')
      }
      db.exec(DDL_V12_WALLET_MARKET)
    }
    if (current < 13 && !tableColumns(db, 'liang_market').includes('rule_version')) {
      // Every schema-12 candidate ran v1. Freeze that historical fact here;
      // never replace this migration default with a future current policy.
      db.exec("ALTER TABLE liang_market ADD COLUMN rule_version TEXT NOT NULL DEFAULT 'liangxiang-market-v1'")
    }
    if (current < 14) db.exec(DDL_V14_MINUTE_CANDLES)
    if (current < 15) {
      if (!tableColumns(db, 'incense_wallet').includes('cumulative_since')) {
        db.exec(`ALTER TABLE incense_wallet ADD COLUMN cumulative_since INTEGER;
          UPDATE incense_wallet SET cumulative_since=created_at;`)
      }
      if (!tableColumns(db, 'incense_wallet').includes('daily_business_date')) {
        db.exec("ALTER TABLE incense_wallet ADD COLUMN daily_business_date TEXT NOT NULL DEFAULT ''")
      }
      db.exec(`CREATE INDEX IF NOT EXISTS ix_wallet_daily_expiry ON incense_wallet(daily_business_date)
        WHERE cumulative_since IS NULL;`)
      // Existing candidate wallets already owned cumulative assets, including
      // frozen positions. Preserve them exactly. A daily-only production
      // database has no wallet rows here; its users opt in individually later.
    }
    if (current !== BACKEND_SCHEMA_USER_VERSION) {
      if (current < 16) db.exec(DDL_V4)
      if (current < 16 && !tableColumns(db, 'liang_archive_meta').includes('reset_version')) {
        db.exec('ALTER TABLE liang_archive_meta ADD COLUMN reset_version INTEGER NOT NULL DEFAULT 0 CHECK (reset_version >= 0)')
      }
      db.exec(`PRAGMA user_version = ${BACKEND_SCHEMA_USER_VERSION}`)
    }
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Preserve the migration error if SQLite already resolved the transaction.
    }
    throw error
  }
}
