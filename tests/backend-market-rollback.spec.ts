import { afterEach, describe, expect, it } from 'vitest'
import type { MarketPositionResponse, MarketSide } from '../src/shared/market-v1.ts'
import { createBackendFixture, type BackendFixture } from './helpers/backend.ts'

const A = 'rollback-wallet-long'
const B = 'rollback-wallet-short'
const MAKER = 'rollback-vote-maker'
const at = (hour: number, minute = 0, day = 16): number => Date.UTC(2026, 7, day, hour - 8, minute)
let fixture: BackendFixture | undefined
afterEach(() => { fixture?.close(); fixture = undefined })

function boot(): BackendFixture {
  fixture = createBackendFixture({}, at(9, 5))
  return fixture
}

/** Throw after the real service body has read its response, before real COMMIT. */
function failOrderCommit(f: BackendFixture, requestId: string, body: () => void): void {
  const transaction = f.store.transaction.bind(f.store)
  f.store.transaction = <T>(work: () => T): T => transaction(() => {
    const value = work()
    if ((value as Partial<MarketPositionResponse> | undefined)?.request_id === requestId) {
      throw new Error('injected order commit failure')
    }
    return value
  })
  try { body() } finally { f.store.transaction = transaction }
}

function order(f: BackendFixture, marketId: string, owner: string, side: MarketSide | null,
  amount: number, requestId: string): MarketPositionResponse {
  // Do not read marketState here: an intervening view would mask version reuse.
  return f.service.setMarketPosition(owner, { market_id: marketId, batch: 1,
    side, amount, request_id: requestId })
}

function wallet(f: BackendFixture, owner: string) {
  return f.store.database.prepare('SELECT available,frozen FROM incense_wallet WHERE installation_id=?')
    .get(owner)
}

function reconcileWallet(f: BackendFixture, owner: string): void {
  const totals = f.store.database.prepare(`SELECT SUM(available_delta) AS available,
    SUM(frozen_delta) AS frozen FROM incense_wallet_entry WHERE installation_id=?`).get(owner)
  expect(totals).toEqual(wallet(f, owner))
}

describe('market cache authority after a real transaction rollback', () => {
  it('discards a failed seven-stick projection before a successful thirteen-stick order reuses its version', () => {
    const f = boot()
    f.grantIncense(A, 100)
    const market = f.service.marketState(A).market!
    const version = Number(f.store.database.prepare('SELECT version FROM liang_market WHERE id=?').get(market.id)!.version)
    const journalRows = f.store.database.prepare('SELECT COUNT(*) AS n FROM incense_wallet_entry').get()
    const rollbackVersion = f.store.rollbackVersion

    failOrderCommit(f, 'rollback-seven', () => {
      expect(() => order(f, market.id, A, 'long', 7, 'rollback-seven'))
        .toThrow('injected order commit failure')
    })
    // Inspect only SQL here, so a fresh view cannot accidentally clear the fault.
    expect(wallet(f, A)).toEqual({ available: 100, frozen: 0 })
    expect(f.store.database.prepare('SELECT * FROM liang_market_position WHERE market_id=?').all(market.id)).toEqual([])
    expect(f.store.database.prepare('SELECT * FROM liang_market_request WHERE request_id=?').get('rollback-seven')).toBeUndefined()
    expect(f.store.database.prepare('SELECT COUNT(*) AS n FROM incense_wallet_entry').get()).toEqual(journalRows)
    expect(f.store.database.prepare('SELECT version FROM liang_market WHERE id=?').get(market.id)).toEqual({ version })

    const committed = order(f, market.id, A, 'long', 13, 'commit-thirteen')
    expect(committed).toMatchObject({ accepted: true, state: { wallet: {
      available_incense: 87, frozen_incense: 13, total_incense: 100,
    } } })
    expect(committed.state.market!.batches[0]).toMatchObject({ status: 'open', reference: null,
      long_incense: 13, short_incense: 0, position: { side: 'long', amount: 13, payout: null } })
    expect(f.store.database.prepare('SELECT version FROM liang_market WHERE id=?').get(market.id))
      .toEqual({ version: version + 1 })
    expect(f.store.rollbackVersion).toBe(rollbackVersion + 1)
    expect(f.service.marketState(A).market!.batches[0]!.long_incense).toBe(13)
    expect(f.store.database.prepare('SELECT reference,available_delta,frozen_delta FROM incense_wallet_entry WHERE kind=?')
      .all('position')).toEqual([{ reference: 'order:commit-thirteen', available_delta: -13, frozen_delta: 13 }])
    reconcileWallet(f, A)
  })

  it('never voids a real two-sided pool because a rolled-back withdrawal cached an empty side', () => {
    const f = boot()
    for (const owner of [A, B]) f.grantIncense(owner, 100)
    f.grantIncense(MAKER, 4)
    const caseId = f.service.ensureActiveCase().id
    for (const direction of ['up', 'down'] as const) {
      expect(f.service.vote(MAKER, { case_id: caseId, vote_type: direction,
        count: 1, request_id: `reference-${direction}` }).result.status).toBe('accepted')
    }
    const market = f.service.marketState(A).market!
    expect(order(f, market.id, A, 'long', 5, 'initial-long').accepted).toBe(true)
    expect(order(f, market.id, B, 'short', 5, 'initial-short').accepted).toBe(true)
    const version = Number(f.store.database.prepare('SELECT version FROM liang_market WHERE id=?').get(market.id)!.version)

    failOrderCommit(f, 'rollback-short-empty', () => {
      expect(() => order(f, market.id, B, null, 0, 'rollback-short-empty'))
        .toThrow('injected order commit failure')
    })
    expect(wallet(f, B)).toEqual({ available: 95, frozen: 5 })
    expect(f.store.database.prepare('SELECT side,amount,payout FROM liang_market_position WHERE market_id=? AND installation_id=?')
      .get(market.id, B)).toEqual({ side: 'short', amount: 5, payout: null })
    expect(f.store.database.prepare('SELECT * FROM liang_market_request WHERE request_id=?').get('rollback-short-empty')).toBeUndefined()
    const changed = order(f, market.id, A, 'long', 13, 'reuse-version-long')
    expect(changed.state.wallet).toMatchObject({ available_incense: 87, frozen_incense: 13 })
    expect(changed.state.market!.batches[0]!.position).toMatchObject({ side: 'long', amount: 13 })
    expect(f.store.database.prepare('SELECT version FROM liang_market WHERE id=?').get(market.id))
      .toEqual({ version: version + 1 })

    f.clock.set(at(11))
    f.service.tick()
    const locked = f.service.marketState(A).market!.batches[0]!
    expect(locked).toMatchObject({ status: 'locked', reference: null, result: null,
      long_incense: 13, short_incense: 5 })
    expect(wallet(f, A)).toEqual({ available: 87, frozen: 13 })
    expect(wallet(f, B)).toEqual({ available: 95, frozen: 5 })
    expect(f.store.database.prepare('SELECT COUNT(*) AS n FROM incense_wallet_entry WHERE kind=?').get('settlement'))
      .toEqual({ n: 0 })

    f.clock.set(at(12))
    f.service.tick()
    expect(f.service.marketState(A).market!.batches[0]).toMatchObject({ status: 'live', result: null,
      reference: { at: at(12), up_votes: 1, down_votes: 1 } })
    expect(f.service.vote(MAKER, { case_id: caseId, vote_type: 'up', count: 2,
      request_id: 'winning-close-up' }).result).toMatchObject({ status: 'accepted', spent_incense: 2 })
    f.clock.set(at(0, 0, 17))
    f.service.tick()

    expect(wallet(f, A)).toEqual({ available: 105, frozen: 0 })
    expect(wallet(f, B)).toEqual({ available: 95, frozen: 0 })
    expect(f.store.database.prepare(`SELECT SUM(available+frozen) AS total FROM incense_wallet
      WHERE installation_id IN (?,?)`).get(A, B)).toEqual({ total: 200 })
    const longReceipt = f.service.marketHistory(A).receipts[0]!
    const shortReceipt = f.service.marketHistory(B).receipts[0]!
    expect(longReceipt).toMatchObject({ invested_incense: 13, returned_incense: 18, pnl_incense: 5,
      close_point: { at: at(0, 0, 17), up_votes: 3, down_votes: 1 },
      batches: [{ batch: 1, side: 'long', amount: 13, payout: 18, result: 'long',
        reference: { at: at(12), up_votes: 1, down_votes: 1 } }] })
    expect(shortReceipt).toMatchObject({ invested_incense: 5, returned_incense: 0, pnl_incense: -5,
      batches: [{ batch: 1, side: 'short', amount: 5, payout: 0, result: 'long' }] })
    expect(longReceipt.returned_incense + shortReceipt.returned_incense).toBe(18)
    for (const owner of [A, B, MAKER]) reconcileWallet(f, owner)
    // Settlement replay must neither refund the failed withdrawal nor pay twice.
    f.service.tick()
    expect(wallet(f, A)).toEqual({ available: 105, frozen: 0 })
    expect(wallet(f, B)).toEqual({ available: 95, frozen: 0 })
  })

  it('invalidates transaction reads even when SQL has already resolved the rollback, preserving the original error', () => {
    const f = boot()
    const version = f.store.rollbackVersion
    const failure = new Error('original resolved transaction failure')
    expect(() => f.store.transaction(() => {
      f.store.database.exec('ROLLBACK')
      throw failure
    })).toThrow(failure)
    expect(f.store.rollbackVersion).toBe(version + 1)
    f.store.transaction(() => 1)
    expect(f.store.rollbackVersion).toBe(version + 1)
  })
})
