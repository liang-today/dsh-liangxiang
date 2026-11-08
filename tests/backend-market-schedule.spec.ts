import { expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { openBackendStore } from '../src/backend/store.ts'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { MARKET_BATCH_HOURS, MARKET_LEGACY_RULE_VERSION, MARKET_PREVIOUS_RULE_VERSION, MARKET_RULE_VERSION, parseMarketState } from '../src/shared/market-v1.ts'
import { emptyMarketCache, readMarketCache, writeMarketCache } from '../src/client/market/market-cache.ts'
import { createBackendFixture, createMutableClock } from './helpers/backend.ts'

const at = (hour: number, minute = 0, day = 16): number => Date.UTC(2026, 7, day, hour - 8, minute)
const A = 'schedule-long', B = 'schedule-short', MAKER = 'schedule-maker'

function fund(service: LiangxiangBackendService): void {
  for (const id of [A, B, MAKER]) {
    service.dailyState(id)
    service.applyTokenClaim(id, { claim_business_date: '2026-08-16', claimed_effective_tokens: 5_000_000 })
  }
}

function vote(service: LiangxiangBackendService, side: 'up' | 'down', request: string): void {
  const intent = { case_id: service.ensureActiveCase().id, vote_type: side, count: 10, request_id: request }
  expect(service.vote(MAKER, intent).result.status).toBe('accepted')
}

function put(service: LiangxiangBackendService, id: string, batch: 1 | 2 | 3, amount: number, request: string) {
  return service.setMarketPosition(id, { market_id: service.marketState(id).market!.id, batch,
    side: id === A ? 'long' : 'short', amount, request_id: request })
}

it('opens new v3 batches at 07/12/17 for four hours and fixes 12/17/22 before boundary votes', () => {
  const f = createBackendFixture({}, at(6, 59))
  try {
    fund(f.service)
    vote(f.service, 'up', 'schedule-seed-up'); vote(f.service, 'down', 'schedule-seed-down')
    const initial = parseMarketState(f.service.marketState(A)).market!
    expect(initial.rule_version).toBe(MARKET_RULE_VERSION)
    expect(initial.opens_at).toBe(at(7))
    expect(initial.batches.every(batch => batch.locks_at - batch.opens_at === 4 * 3_600_000)).toBe(true)
    expect(initial.batches.map(b => [b.opens_at, b.locks_at, b.reference_at]))
      .toEqual(MARKET_BATCH_HOURS.map(hours => hours.map(hour => at(hour))))
    expect(initial.closes_at).toBe(at(0, 0, 17))
    expect(put(f.service, A, 1, 10, 'schedule-p1-too-early').reason).toBe('batch_not_open')
    f.clock.set(at(7))
    for (const id of [A, B]) expect(put(f.service, id, 1, 10, `schedule-p1-${id}`).accepted).toBe(true)
    f.clock.set(at(11))
    expect(put(f.service, A, 1, 11, 'schedule-p1-too-late').reason).toBe('batch_not_open')
    f.clock.set(at(12))
    for (const id of [A, B]) expect(put(f.service, id, 2, 10, `schedule-p2-${id}`).accepted).toBe(true)
    f.clock.set(at(16))
    expect(put(f.service, A, 2, 11, 'schedule-p2-too-late').reason).toBe('batch_not_open')
    expect(put(f.service, A, 3, 10, 'schedule-p3-too-early').reason).toBe('batch_not_open')
    f.clock.set(at(16, 59)); vote(f.service, 'up', 'schedule-before-p2')
    f.clock.set(at(17)); vote(f.service, 'down', 'schedule-after-p2')
    expect(f.service.marketState(A).market!.batches[1]!.reference).toMatchObject({ at: at(17), up_votes: 20, down_votes: 10 })
    for (const id of [A, B]) expect(put(f.service, id, 3, 10, `schedule-p3-${id}`).accepted).toBe(true)
    f.clock.set(at(21))
    expect(put(f.service, A, 3, 11, 'schedule-p3-too-late').reason).toBe('batch_not_open')
    f.clock.set(at(21, 59)); vote(f.service, 'down', 'schedule-before-p3')
    f.clock.set(at(22)); vote(f.service, 'up', 'schedule-after-p3')
    expect(f.service.marketState(A).market!.batches[2]!.reference).toMatchObject({ at: at(22), up_votes: 20, down_votes: 30 })
    f.clock.set(at(0, 0, 17)); f.service.tick()
    const receipt = f.service.marketHistory(A).receipts[0]!
    expect(receipt.rule_version).toBe(MARKET_RULE_VERSION)
    expect(receipt.batches.map(batch => batch.result)).toEqual(['draw', 'short', 'long'])
    expect(receipt.close_point).toMatchObject({ case_id: initial.case_id, at: initial.closes_at, up_votes: 30, down_votes: 30 })
    expect([A, B].map(id => f.service.marketState(id).wallet.available_incense)).toEqual([100, 100])
    const before = f.service.marketHistory(A)
    f.service.tick()
    expect(f.service.marketHistory(A)).toEqual(before)
  } finally { f.close() }
})

it('keeps an existing v2 early cutoff and frozen position across restart, then starts v3 at seven tomorrow', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-schedule-v2-')), filename = join(directory, 'schedule.sqlite')
  const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: filename, LIANGXIANG_STARTER_INCENSE: '0', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0' })
  const clock = createMutableClock(at(6, 59))
  let store = openBackendStore(filename)
  try {
    let service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    const id = service.marketState(A).market!.id
    store.database.prepare('UPDATE liang_market SET rule_version=?,opens_at=? WHERE id=?').run(MARKET_PREVIOUS_RULE_VERSION, at(9), id)
    store.database.prepare('UPDATE liang_market_batch SET opens_at=? WHERE market_id=? AND batch=1').run(at(9), id)
    store.close(); store = openBackendStore(filename)
    service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    fund(service)
    clock.set(at(7))
    expect(put(service, A, 1, 12, 'previous-too-early').reason).toBe('batch_not_open')
    clock.set(at(9))
    expect(put(service, A, 1, 12, 'previous-position').accepted).toBe(true)
    const wallet = service.marketState(A).wallet
    store.close(); store = openBackendStore(filename)
    service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    expect(parseMarketState(service.marketState(A)).market).toMatchObject({ rule_version: MARKET_PREVIOUS_RULE_VERSION, opens_at: at(9) })
    expect(service.marketState(A).wallet).toEqual(wallet)
    expect(service.marketState(A).market!.batches[0]).toMatchObject({ opens_at: at(9), locks_at: at(11), reference_at: at(12), position: { amount: 12 } })
    clock.set(at(11))
    expect(put(service, A, 1, 13, 'previous-too-late').reason).toBe('batch_not_open')
    clock.set(at(0, 0, 17)); service.tick()
    expect(service.marketHistory(A).receipts[0]).toMatchObject({ rule_version: MARKET_PREVIOUS_RULE_VERSION, invested_incense: 12, returned_incense: 12 })
    expect(service.marketState(A).market).toMatchObject({ rule_version: MARKET_RULE_VERSION, opens_at: at(7, 0, 17) })
    expect(store.database.prepare('SELECT rule_version,opens_at FROM liang_market WHERE id=?').get(id)).toMatchObject({ rule_version: MARKET_PREVIOUS_RULE_VERSION, opens_at: at(9) })
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})

it('reopens a persisted v1 market without changing its old deadlines or frozen funds, then opens v3 tomorrow', () => {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-schedule-restart-')), filename = join(directory, 'schedule.sqlite')
  const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: filename, LIANGXIANG_STARTER_INCENSE: '0', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0' })
  const clock = createMutableClock(at(9)), legacyHours = [[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const
  let store = openBackendStore(filename)
  try {
    let service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    const marketId = service.marketState(A).market!.id
    // Fixture representing a pre-upgrade v1 database. Current code must read
    // these exact persisted deadlines rather than replacing them with v3.
    store.database.prepare('UPDATE liang_market SET rule_version=?,opens_at=? WHERE id=?').run(MARKET_LEGACY_RULE_VERSION, at(9), marketId)
    for (let i = 0; i < legacyHours.length; i++) {
      const hours = legacyHours[i]!
      store.database.prepare('UPDATE liang_market_batch SET opens_at=?,locks_at=?,reference_at=? WHERE market_id=? AND batch=?')
        .run(at(hours[0]), at(hours[1]), at(hours[2]), marketId, i + 1)
    }
    store.close(); store = openBackendStore(filename)
    service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    fund(service); vote(service, 'up', 'legacy-seed-up'); vote(service, 'down', 'legacy-seed-down')
    clock.set(at(12))
    expect(put(service, A, 2, 10, 'legacy-p2-long').accepted).toBe(true)
    expect(put(service, B, 2, 10, 'legacy-p2-short').accepted).toBe(true)
    clock.set(at(16, 30))
    const adjustId = 'legacy-p2-still-open'
    expect(put(service, A, 2, 12, adjustId).accepted).toBe(true)
    const frozen = service.marketState(A).wallet
    const deadlines = store.database.prepare('SELECT opens_at,locks_at,reference_at FROM liang_market_batch WHERE market_id=? ORDER BY batch').all(marketId)
    store.close(); store = openBackendStore(filename)
    service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    const restored = parseMarketState(service.marketState(A))
    expect(restored.market!.rule_version).toBe(MARKET_LEGACY_RULE_VERSION)
    expect(restored.wallet).toEqual(frozen)
    expect(store.database.prepare('SELECT opens_at,locks_at,reference_at FROM liang_market_batch WHERE market_id=? ORDER BY batch').all(marketId)).toEqual(deadlines)
    expect(put(service, A, 2, 12, adjustId).accepted).toBe(true)
    expect(service.marketState(A).wallet).toEqual(frozen)
    clock.set(at(17))
    expect(put(service, A, 2, 13, 'legacy-p2-lock').reason).toBe('batch_not_open')
    expect(put(service, A, 3, 10, 'legacy-p3-not-yet').reason).toBe('batch_not_open')
    expect(service.marketState(A).market!.batches[1]!.reference).toBeNull()
    clock.set(at(18))
    for (const id of [A, B]) expect(put(service, id, 3, 10, `legacy-p3-${id}`).accepted).toBe(true)
    expect(service.marketState(A).market!.batches[1]!.reference?.at).toBe(at(18))
    clock.set(at(20))
    expect(put(service, A, 3, 11, 'legacy-p3-lock').reason).toBe('batch_not_open')
    clock.set(at(21)); service.tick()
    expect(service.marketState(A).market!.batches[2]!.reference?.at).toBe(at(21))
    clock.set(at(22)); vote(service, 'up', 'legacy-after-reference')
    clock.set(at(0, 0, 17)); service.tick()
    const receipt = service.marketHistory(A).receipts[0]!
    expect(receipt).toMatchObject({ rule_version: MARKET_LEGACY_RULE_VERSION, invested_incense: 22, returned_incense: 42, pnl_incense: 20 })
    expect([A, B].map(id => service.marketState(id).wallet.available_incense)).toEqual([120, 80])
    const cache = emptyMarketCache('schedule-cache'), data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
    cache.receipts = [receipt]; writeMarketCache(storage, cache)
    expect(readMarketCache(storage, cache.scope).receipts).toEqual([receipt])
    const tomorrow = service.marketState(A).market!
    expect(tomorrow.rule_version).toBe(MARKET_RULE_VERSION)
    expect(tomorrow.batches.map(batch => batch.reference_at)).toEqual([12, 17, 22].map(hour => at(hour, 0, 17)))
    expect(store.database.prepare('SELECT rule_version FROM liang_market WHERE id=?').get(marketId)?.rule_version).toBe(MARKET_LEGACY_RULE_VERSION)
    expect(store.database.prepare('SELECT opens_at,locks_at,reference_at FROM liang_market_batch WHERE market_id=? ORDER BY batch').all(marketId)).toEqual(deadlines)
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})
