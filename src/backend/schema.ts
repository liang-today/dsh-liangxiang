/**
 * SQLite schema (v5) for the Liangxiang backend.
 *
 * Design notes that matter for the frozen invariants:
 *
 *  - `daily_liang_case`: at most ONE active case per business date, enforced by
 *    a partial unique index rather than by application code. Operators may
 *    archive today's case and open another (same-day republish); the index
 *    still refuses two actives. The first lazy-open id is `case-YYYY-MM-DD`;
 *    later publishes use `case-YYYY-MM-DD-<hex>`.
 *  - `daily_incense_state`: the installation-level daily spend ledger. The
 *    CHECK constraint `used_incense * token_per_incense <= claimed_effective_tokens`
 *    means the database itself refuses an overspend, so a bug in the service
 *    cannot produce a row that violates `used <= earned`.
 *  - `liang_vote`: `UNIQUE (installation_id, request_id)` is the idempotency
 *    key. Only ACCEPTED votes are recorded, so a rejection never poisons a
 *    request id.
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

export const BACKEND_SCHEMA_USER_VERSION = 5

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

/** Apply the schema and record its user_version (idempotent). */
export function migrate(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(DDL)
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
  const current = typeof row?.user_version === 'number' ? row.user_version : 0
  if (current > BACKEND_SCHEMA_USER_VERSION) {
    throw new Error(
      `liangxiang backend database is at schema version ${current}, newer than this build (${BACKEND_SCHEMA_USER_VERSION})`,
    )
  }
  if (current < 2) db.exec(DDL_V2)
  if (current < 3) db.exec(DDL_V3)
  if (current < 4) db.exec(DDL_V4)
  if (current < 5) db.exec(DDL_V5)
  if (current !== BACKEND_SCHEMA_USER_VERSION) {
    db.exec(`PRAGMA user_version = ${BACKEND_SCHEMA_USER_VERSION}`)
  }
}
