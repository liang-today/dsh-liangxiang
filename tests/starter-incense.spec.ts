/**
 * Welcome gift: 10 sticks once per device fingerprint per business date.
 * Re-keying the same machine does not mint a second gift the same day.
 */
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { BACKEND_SCHEMA_USER_VERSION, migrate } from '../src/backend/schema.ts'
import { STARTER_INCENSE_COUNT } from '../src/shared/index.ts'
import { createBackendFixture, DAY_MS, type BackendFixture } from './helpers/backend.ts'

const INSTALLATION = 'install-starter-0001'
const NEXT = 'install-starter-0002'
const FINGERPRINT = 'fp-starter-device-1'

let fixture: BackendFixture | null = null

function boot(env: Record<string, string | undefined> = {}): BackendFixture {
  fixture?.close()
  fixture = createBackendFixture(env)
  return fixture
}

function bindFingerprint(f: BackendFixture, installationId: string, fingerprint = FINGERPRINT): void {
  f.store.upsertIdentity({
    installation_id: installationId,
    public_key: `pk-${installationId}`,
    device_fingerprint: fingerprint,
    created_at: f.clock.now(),
    last_seen_at: f.clock.now(),
  })
}

afterEach(() => {
  fixture?.close()
  fixture = null
})

describe('starter incense grant', () => {
  it('migrates the backend schema to v8 with archive voters and vote request counts', () => {
    const db = new DatabaseSync(':memory:')
    migrate(db)
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(version.user_version).toBe(BACKEND_SCHEMA_USER_VERSION)
    const columns = (db.prepare('PRAGMA table_info(daily_incense_state)').all() as Array<{ name: string }>)
      .map((row) => row.name)
    expect(columns).toContain('starter_tokens')
    const grant = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'starter_incense_grant'",
    ).get()
    expect(grant).toBeDefined()
    const dayColumns = (db.prepare('PRAGMA table_info(liang_day_archive)').all() as Array<{ name: string }>)
      .map((row) => row.name)
    expect(dayColumns).toContain('unique_voters')
    const voteColumns = (db.prepare('PRAGMA table_info(liang_vote)').all() as Array<{ name: string }>)
      .map((row) => row.name)
    expect(voteColumns).toContain('requested_count')
    db.close()
  })

  it('upgrades an existing v7 vote table without inventing historical request counts', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE liang_vote (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id               TEXT    NOT NULL,
        installation_id          TEXT    NOT NULL,
        case_id                  TEXT    NOT NULL,
        business_date            TEXT    NOT NULL,
        vote_type                TEXT    NOT NULL CHECK (vote_type IN ('up', 'down')),
        used_incense_after       INTEGER NOT NULL CHECK (used_incense_after > 0),
        remaining_incense_after  INTEGER NOT NULL CHECK (remaining_incense_after >= 0),
        created_at               INTEGER NOT NULL,
        UNIQUE (installation_id, request_id)
      );
      INSERT INTO liang_vote
        (request_id, installation_id, case_id, business_date, vote_type,
         used_incense_after, remaining_incense_after, created_at)
      VALUES ('legacy-request', 'legacy-install', 'legacy-case', '2026-08-16', 'up', 4, 2, 1);
      PRAGMA user_version = 7;
    `)

    migrate(db)

    const version = db.prepare('PRAGMA user_version').get() as { user_version: number }
    const legacy = db.prepare(
      "SELECT requested_count FROM liang_vote WHERE request_id = 'legacy-request'",
    ).get() as { requested_count: number | null }
    expect(version.user_version).toBe(BACKEND_SCHEMA_USER_VERSION)
    expect(legacy.requested_count).toBeNull()
    db.close()
  })

  it('does not gift unsigned installations that have no fingerprint', () => {
    const f = boot()
    const state = f.service.dailyState(INSTALLATION).authoritative_personal_state
    expect(state.remaining_incense).toBe(0)
    expect(state.claimed_effective_tokens).toBe(0)
    expect(f.store.incenseFor(INSTALLATION, f.service.businessDate())?.starter_tokens).toBe(0)
  })

  it('gifts 10 sticks on the first daily-state of a fingerprinted install', () => {
    const f = boot()
    bindFingerprint(f, INSTALLATION)
    const first = f.service.dailyState(INSTALLATION).authoritative_personal_state
    expect(first.remaining_incense).toBe(STARTER_INCENSE_COUNT)
    expect(first.earned_incense).toBe(STARTER_INCENSE_COUNT)
    expect(first.claimed_effective_tokens).toBe(STARTER_INCENSE_COUNT * f.config.tokenPerIncense)
    expect(f.store.incenseFor(INSTALLATION, f.service.businessDate())?.starter_tokens)
      .toBe(STARTER_INCENSE_COUNT * f.config.tokenPerIncense)

    const again = f.service.dailyState(INSTALLATION).authoritative_personal_state
    expect(again.remaining_incense).toBe(STARTER_INCENSE_COUNT)
    expect(again.claimed_effective_tokens).toBe(first.claimed_effective_tokens)
  })

  it('keeps the gift when later token claims raise the host-observed watermark', () => {
    const f = boot()
    bindFingerprint(f, INSTALLATION)
    f.service.dailyState(INSTALLATION)
    const gift = STARTER_INCENSE_COUNT * f.config.tokenPerIncense
    const after = f.service.applyTokenClaim(INSTALLATION, {
      claimed_effective_tokens: gift + 50_000,
      claim_business_date: f.service.businessDate(),
    })
    expect(after.authoritative_personal_state.claimed_effective_tokens).toBe(gift + 50_000)
    expect(after.authoritative_personal_state.remaining_incense).toBe(STARTER_INCENSE_COUNT + 1)
  })

  it('does not gift again after a same-day re-key of the same fingerprint', () => {
    const f = boot({ LIANGXIANG_REKEY_COOLDOWN_MS: '0' })
    bindFingerprint(f, INSTALLATION)
    expect(f.service.dailyState(INSTALLATION).authoritative_personal_state.remaining_incense)
      .toBe(STARTER_INCENSE_COUNT)

    f.service.rekeyIdentity(NEXT, `pk-${NEXT}`, FINGERPRINT)
    const rebound = f.service.dailyState(NEXT).authoritative_personal_state
    expect(rebound.remaining_incense).toBe(0)
    expect(rebound.claimed_effective_tokens).toBe(0)
  })

  it('gifts again on the next business date', () => {
    const f = boot()
    bindFingerprint(f, INSTALLATION)
    expect(f.service.dailyState(INSTALLATION).authoritative_personal_state.remaining_incense)
      .toBe(STARTER_INCENSE_COUNT)

    f.clock.advance(DAY_MS)
    const nextDay = f.service.dailyState(INSTALLATION).authoritative_personal_state
    expect(nextDay.business_date).toBe('2026-08-17')
    expect(nextDay.remaining_incense).toBe(STARTER_INCENSE_COUNT)
  })

  it('can be disabled with LIANGXIANG_STARTER_INCENSE=0', () => {
    const f = boot({ LIANGXIANG_STARTER_INCENSE: '0' })
    bindFingerprint(f, INSTALLATION)
    expect(f.service.dailyState(INSTALLATION).authoritative_personal_state.remaining_incense).toBe(0)
  })
})
