/** Daily expiry, one-way wallet activation and monetary invariants on isolated SQLite. */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openBackendStore } from '../src/backend/store.ts'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { MarketLedger } from '../src/backend/market-ledger.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { migrate } from '../src/backend/schema.ts'
import { createBackendFixture, type BackendFixture } from './helpers/backend.ts'

const at = (hour: number, day = 16) => Date.UTC(2026, 7, day, hour - 8)
let f: BackendFixture | undefined
afterEach(() => { f?.close(); f = undefined })
function setup() {
  f = createBackendFixture({ LIANGXIANG_STARTER_INCENSE: '0' }, at(9))
  return { ...f, ledger: new MarketLedger(f.store, 'Asia/Shanghai') }
}
function audit(f: BackendFixture) {
  expect(f.store.database.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' })
  expect(f.store.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  const rows = f.store.database.prepare(`SELECT w.installation_id FROM incense_wallet w LEFT JOIN
    (SELECT installation_id,SUM(available_delta) AS a,SUM(frozen_delta) AS f
      FROM incense_wallet_entry GROUP BY installation_id) e USING(installation_id)
    WHERE w.available<>COALESCE(e.a,0) OR w.frozen<>COALESCE(e.f,0) OR w.available<0 OR w.frozen<0`).all()
  expect(rows).toEqual([])
}

describe('per-installation wallet activation', () => {
  it('expires an offline old balance and fraction exactly once, then upgrades only the live day', () => {
    const h = setup(), id = 'activation-delayed-old'
    h.service.bootstrap(id, undefined, false)
    h.service.applyTokenClaim(id, { claim_business_date: '2026-08-16', claimed_effective_tokens: 549_000 }, undefined, false)
    h.service.vote(id, { case_id: 'case-2026-08-16', vote_type: 'up', count: 3, request_id: 'daily-spend-three' }, undefined, Infinity, true)
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 7, token_remainder: 49_000 })
    h.clock.set(at(9, 20)); h.service.tick(); h.service.tick()
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 0, token_remainder: 0 })
    expect(h.store.database.prepare("SELECT COUNT(*) AS n FROM incense_wallet_entry WHERE kind='daily_expiry'").get()!.n).toBe(1)
    expect(h.store.incenseFor(id, '2026-08-16')).toMatchObject({ claimed_effective_tokens: 549_000, used_incense: 3 })
    h.service.applyTokenClaim(id, { claim_business_date: '2026-08-20', claimed_effective_tokens: 149_000 }, undefined, false)
    expect(h.service.bootstrap(id).authoritative_personal_state.wallet).toMatchObject({ available_incense: 2, token_remainder: 49_000 })
    h.clock.set(at(9, 21)); h.service.tick()
    h.service.applyTokenClaim(id, { claim_business_date: '2026-08-21', claimed_effective_tokens: 1_000 })
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 3, token_remainder: 0 })
    expect(() => h.service.bootstrap(id, undefined, false)).toThrow('2.0.0')
    audit(h)
  })

  it('expires daily-only funds on reopening a real file, then persists the one-way choice over another restart', () => {
    const directory = mkdtempSync(join(tmpdir(), 'liangxiang-wallet-activation-'))
    const path = join(directory, 'isolated.sqlite'), id = 'activation-restart-old'
    const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: path,
      LIANGXIANG_STARTER_INCENSE: '0', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0' })
    let now = at(9), store = openBackendStore(path)
    const clock = { now: () => now }
    const create = () => new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    try {
      let service = create()
      service.applyTokenClaim(id, { claim_business_date: '2026-08-16', claimed_effective_tokens: 349_000 }, undefined, false)
      store.close(); now = at(9, 17); store = openBackendStore(path); service = create()
      expect(new MarketLedger(store, 'Asia/Shanghai').wallet(id)).toMatchObject({ available_incense: 0, token_remainder: 0 })
      service.bootstrap(id)
      service.applyTokenClaim(id, { claim_business_date: '2026-08-17', claimed_effective_tokens: 249_000 })
      store.close(); now = at(9, 18); store = openBackendStore(path); service = create()
      expect(service.bootstrap(id).authoritative_personal_state.wallet).toMatchObject({ available_incense: 4, token_remainder: 49_000 })
      expect(() => service.applyTokenClaim(id, { claim_business_date: '2026-08-18', claimed_effective_tokens: 999_000 }, undefined, false)).toThrow('2.0.0')
      expect(store.incenseFor(id, '2026-08-18')?.claimed_effective_tokens).toBe(0)
      expect(store.database.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' })
      expect(store.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
  })

  it('keeps frozen funds, reference fixing and exactly-once midnight payouts intact under downgraded requests', () => {
    const h = setup(), ids = ['activation-long', 'activation-short', 'activation-maker']
    for (const id of ids) h.grantIncense(id, 10)
    const vote = (direction: 'up' | 'down', count: number, request_id: string) => h.service.vote(ids[2]!, {
      case_id: 'case-2026-08-16', vote_type: direction, count, request_id })
    vote('up', 1, 'activation-seed-up'); vote('down', 1, 'activation-seed-down')
    const marketId = h.service.marketState(ids[0]!).market!.id
    for (const [n, side] of ['long', 'short'].entries()) {
      expect(h.service.setMarketPosition(ids[n]!, { market_id: marketId, batch: 1,
        side: side as 'long' | 'short', amount: 8, request_id: `activation-position-${n}` }).accepted).toBe(true)
    }
    const blocked = () => {
      const before = ids.map(id => h.ledger.wallet(id))
      for (let n = 0; n < 50; n++) for (const id of ids.slice(0, 2)) {
        expect(() => h.service.bootstrap(id, undefined, false)).toThrow('2.0.0')
        expect(() => h.service.applyTokenClaim(id, { claim_business_date: h.service.businessDate(),
          claimed_effective_tokens: 1_000_000 }, undefined, false)).toThrow('2.0.0')
        expect(() => h.service.vote(id, { case_id: h.service.ensureActiveCase().id, vote_type: 'up',
          request_id: `activation-block-${n}` }, undefined, Infinity, true)).toThrow('2.0.0')
      }
      expect(ids.map(id => h.ledger.wallet(id))).toEqual(before)
    }
    blocked(); h.clock.set(at(12)); h.service.tick(); blocked()
    vote('up', 4, 'activation-close-up')
    h.clock.set(at(0, 17)); h.service.tick(); blocked()
    expect(h.ledger.wallet(ids[0]!)).toMatchObject({ available_incense: 18, frozen_incense: 0 })
    expect(h.ledger.wallet(ids[1]!)).toMatchObject({ available_incense: 2, frozen_incense: 0 })
    expect(h.service.marketHistory(ids[0]!).receipts[0]).toMatchObject({ invested_incense: 8, returned_incense: 16, pnl_incense: 8 })
    expect(h.service.marketHistory(ids[1]!).receipts[0]).toMatchObject({ invested_incense: 8, returned_incense: 0, pnl_incense: -8 })
    const before = ids.map(id => h.ledger.wallet(id))
    for (let n = 0; n < 10; n++) h.service.tick()
    expect(ids.map(id => h.ledger.wallet(id))).toEqual(before)
    audit(h)
  })

  it('migrates an existing schema-14 candidate without changing money, reservations, receipts or claims', () => {
    const h = setup(), id = 'activation-schema14'
    h.grantIncense(id, 12, 1234)
    const state = h.service.marketState(id)
    h.service.setMarketPosition(id, { market_id: state.market!.id, batch: 1, side: 'long', amount: 7, request_id: 'schema14-freeze' })
    const before = h.ledger.wallet(id)
    const tables = ['incense_wallet_entry', 'incense_wallet_cursor', 'daily_incense_state', 'liang_market_position', 'liang_market_request']
    const snapshot = () => tables.map(table => h.store.database.prepare(`SELECT * FROM ${table}`).all())
    const rows = snapshot()
    h.store.database.exec(`DROP INDEX ix_wallet_daily_expiry;
      ALTER TABLE incense_wallet DROP COLUMN cumulative_since;
      ALTER TABLE incense_wallet DROP COLUMN daily_business_date;
      PRAGMA user_version=14;`)
    migrate(h.store.database); migrate(h.store.database)
    expect(h.ledger.wallet(id)).toEqual(before)
    expect(snapshot()).toEqual(rows)
    expect(() => h.service.bootstrap(id, undefined, false)).toThrow('2.0.0')
    h.clock.set(at(0, 17)); h.service.tick()
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 12, frozen_incense: 0, token_remainder: 1234 })
    audit(h)
  })

  it('rolls back a failed activation without changing the daily balance or enabling cumulative mode', () => {
    const h = setup(), id = 'activation-rollback'
    h.service.applyTokenClaim(id, { claim_business_date: '2026-08-16', claimed_effective_tokens: 149_000 }, undefined, false)
    const before = h.ledger.wallet(id)
    h.store.database.exec(`CREATE TRIGGER activation_failure BEFORE UPDATE OF cumulative_since ON incense_wallet
      BEGIN SELECT RAISE(ABORT,'injected activation failure'); END;`)
    expect(() => h.service.bootstrap(id)).toThrow('injected activation failure')
    expect(h.ledger.wallet(id)).toEqual(before)
    expect(h.store.database.prepare('SELECT cumulative_since FROM incense_wallet WHERE installation_id=?').get(id)!.cumulative_since).toBeNull()
    h.store.database.exec('DROP TRIGGER activation_failure')
    h.clock.set(at(0, 17)); h.service.tick()
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 0, token_remainder: 0 })
    audit(h)
  })
})
