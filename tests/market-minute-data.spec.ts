import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createBackendFixture, type BackendFixture } from './helpers/backend.ts'
import { migrate, BACKEND_SCHEMA_USER_VERSION } from '../src/backend/schema.ts'
import { MarketLedger } from '../src/backend/market-ledger.ts'
import { MARKET_CANDLE_INTERVAL_MS, MARKET_LEGACY_CANDLE_INTERVAL_MS, parseMarketState, type MarketCandle, type MarketState } from '../src/shared/market-v1.ts'
import { createMarketSession, type MarketResponse, type MarketTransport } from '../src/client/market/market-client.ts'
import { emptyMarketCache, readMarketCache, writeMarketCache, type MarketStorage } from '../src/client/market/market-cache.ts'
import { parseMarketCandlesQuery } from '../src/host/market-query.ts'

const DAY = Date.UTC(2026, 7, 16), MINUTE = 60_000, HOUR = 3_600_000
const at = (hour: number, minute = 0): number => DAY + (hour - 8) * HOUR + minute * MINUTE
const fixtures: BackendFixture[] = []
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); vi.restoreAllMocks() })
const boot = (hour = 8): BackendFixture => { const f = createBackendFixture({}, at(hour)); fixtures.push(f); return f }
const candle = (index: number): MarketCandle => ({ at: DAY + index * MINUTE, open: .5, high: .51, low: .49, close: .5, up_votes: index + 10, down_votes: index + 10, volume: 2 })

function state(): MarketState {
  return { schema_version: 1, soft_trust: true, server_time: DAY + 10 * HOUR,
    candle_interval_ms: MARKET_CANDLE_INTERVAL_MS,
    wallet: { available_incense: 100, frozen_incense: 0, total_incense: 100, token_remainder: 0, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'minute-case', at: DAY + 10 * HOUR, up_votes: 10, down_votes: 10, sequence: 1 },
    market: { id: 'minute-market', case_id: 'minute-case', business_date: '2026-08-16', timezone: 'UTC', rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: ([[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const).map(([open, lock, reference], i) => ({ batch: (i + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR, status: i === 0 ? 'open' : 'pending', reference: null, long_incense: 0, short_incense: 0, position: null, result: null })) } }
}
function storage(): MarketStorage {
  const data = new Map<string, string>()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } }
}
function transport(readCandles: (path: string) => Promise<MarketResponse> | MarketResponse, initial = state()) {
  const calls: string[] = []
  let frame: ((value: unknown, scope: string) => void) | undefined
  const io: MarketTransport = {
    async request(path) {
      calls.push(path)
      if (path.startsWith('/candles')) return readCandles(path)
      if (path.startsWith('/history')) return { body: { schema_version: 1, receipts: [], next_cursor: null }, scope: 'minute-identity' }
      return { body: initial, scope: 'minute-identity' }
    },
    events(callback) { frame = callback; return { close() {} } },
    requestId: () => 'minute-request', dispose() {},
  }
  return { io, calls, feed: (value: MarketState, scope = 'minute-identity') => frame?.(value, scope) }
}
const page = (candles: MarketCandle[], cursor: string | null = null, interval = MINUTE) => ({ schema_version: 1, case_id: 'minute-case', business_date: '2026-08-16', interval_ms: interval, candles, next_cursor: cursor })

describe('real minute candles and preserved legacy history', () => {
  it('persists the minute table across real SQLite reopen while preserving overlapping legacy timestamps', () => {
    const directory = mkdtempSync(join(tmpdir(), 'liangxiang-minute-restart-')), filename = join(directory, 'minute.sqlite')
    let db = new DatabaseSync(filename)
    try {
      migrate(db)
      db.prepare('INSERT INTO liang_market_candle VALUES (?,?,?,?,?,?,?,?,?,?)').run('retained-case', '2026-08-16', DAY, .4, .7, .3, .5, 50, 50, 100)
      db.exec('DROP TABLE liang_market_minute_candle; PRAGMA user_version=13')
      db.close(); db = new DatabaseSync(filename); migrate(db)
      expect(db.prepare('SELECT COUNT(*) AS n FROM liang_market_minute_candle').get()?.n).toBe(0)
      db.prepare('INSERT INTO liang_market_minute_candle VALUES (?,?,?,?,?,?,?,?,?,?)').run('retained-case', '2026-08-16', DAY, .5, .5, .5, .5, 51, 51, 2)
      db.close(); db = new DatabaseSync(filename); migrate(db)
      expect(db.prepare('SELECT volume FROM liang_market_candle').get()?.volume).toBe(100)
      expect(db.prepare('SELECT volume FROM liang_market_minute_candle').get()?.volume).toBe(2)
      expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
    } finally { db.close(); rmSync(directory, { recursive: true, force: true }) }
  })

  it('migrates schema 13 without splitting, deleting or reinterpreting old five-minute candles', () => {
    const f = boot(), active = f.service.ensureActiveCase()
    f.store.database.prepare('INSERT INTO liang_market_candle VALUES (?,?,?,?,?,?,?,?,?,?)').run(active.id, active.business_date, at(8), .4, .7, .3, .5, 50, 50, 100)
    f.store.database.exec('DROP TABLE liang_market_minute_candle; PRAGMA user_version=13')
    migrate(f.store.database); migrate(f.store.database)
    expect(BACKEND_SCHEMA_USER_VERSION).toBe(15)
    expect(f.store.database.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 15 })
    expect(f.service.marketCandles().candles).toEqual([])
    const old = f.service.marketCandles({ interval_ms: MARKET_LEGACY_CANDLE_INTERVAL_MS })
    expect(old.interval_ms).toBe(300_000)
    expect(old.candles).toEqual([{ at: at(8), open: .4, high: .7, low: .3, close: .5, up_votes: 50, down_votes: 50, volume: 100 }])
    f.service.tick()
    expect(f.service.marketCandles()).toMatchObject({ interval_ms: MINUTE, candles: [{ at: at(8), close: null, volume: 0 }] })
    expect(f.service.marketCandles({ interval_ms: 300_000 }).candles).toEqual(old.candles)
  })

  it('records before opening and after position cutoff, then changes case at midnight without moving settlement', () => {
    const f = boot(6), id = 'minute-participant', maker = 'minute-maker'
    f.grantIncense(id, 10); f.grantIncense(maker, 10)
    const market = f.service.marketState(id).market!
    expect(f.service.setMarketPosition(id, { market_id: market.id, batch: 1, side: 'long', amount: 1, request_id: 'before-open-position' }).accepted).toBe(false)
    const vote = (side: 'up' | 'down', request: string) => f.service.vote(maker, { case_id: market.case_id, vote_type: side, request_id: request })
    vote('up', 'minute-before-open-up')
    f.clock.set(at(6, 1)); vote('down', 'minute-before-open-down')
    const early = f.service.marketCandles().candles
    expect(early).toHaveLength(2)
    expect(early[1]).toMatchObject({ at: at(6, 1), open: 1, high: 1, low: .5, close: .5, volume: 1 })
    f.clock.set(at(23, 30)); f.service.tick()
    expect(f.service.marketState(id).current_candle).toMatchObject({ at: at(23, 30), close: .5, volume: 0 })
    expect(f.service.setMarketPosition(id, { market_id: market.id, batch: 3, side: 'short', amount: 1, request_id: 'after-lock-position' }).accepted).toBe(false)
    f.clock.set(at(24)); f.service.tick()
    const next = f.service.marketState(id)
    expect(next.current_point?.case_id).not.toBe(market.case_id)
    expect(next.current_candle).toMatchObject({ at: at(24), close: null, volume: 0 })
    expect(f.store.database.prepare('SELECT close_point FROM liang_market WHERE id=?').get(market.id)?.close_point).toContain('"up_votes":1,"down_votes":1')
    expect(f.service.marketCandles({ caseId: market.case_id }).candles.at(-1)?.at).toBe(at(23, 30))
  })

  it('adds at most one quiet minute row globally, not one row for every subscriber or tick', () => {
    const f = boot(), writes = vi.spyOn(MarketLedger.prototype, 'recordCandle')
    f.service.tick()
    for (let i = 0; i < 50; i++) { f.service.tick(at(8) + i * 1_000); f.service.marketStateForStream('minute-reader') }
    expect(writes).toHaveBeenCalledTimes(1)
    f.clock.set(at(8, 1)); f.service.tick()
    expect(writes).toHaveBeenCalledTimes(2)
    expect(f.service.marketCandles().candles.map(c => c.at)).toEqual([at(8), at(8, 1)])
  })

  it('keeps 288-point pages and accepts only explicit supported query grains', () => {
    const f = boot(), active = f.service.ensureActiveCase()
    const insert = f.store.database.prepare('INSERT INTO liang_market_minute_candle VALUES (?,?,?,?,?,?,?,?,?,?)')
    f.store.transaction(() => { for (let i = 0; i < 320; i++) insert.run(active.id, active.business_date, at(0) + i * MINUTE, .5, .5, .5, .5, 10, 10, 0) })
    const first = f.service.marketCandles()
    const last = f.service.marketCandles({ cursor: first.next_cursor! })
    expect(first.candles).toHaveLength(288)
    expect(last.candles).toHaveLength(32)
    expect(last.next_cursor).toBeNull()
    expect(first.interval_ms).toBe(MINUTE)
    expect(parseMarketCandlesQuery(new URLSearchParams('interval_ms=60000&limit=288'))).toEqual({ interval_ms: MINUTE, limit: 288 })
    for (const value of ['1000', '6e4', '60000.0']) expect(() => parseMarketCandlesQuery(new URLSearchParams(`interval_ms=${value}`))).toThrow()
  })
})

describe('minute history cold channel and cache', () => {
  it('fetches all bounded pages once and refreshes only recent buckets at the existing five-minute cadence', async () => {
    const all = Array.from({ length: 320 }, (_, index) => candle(index))
    const t = transport(path => {
      const params = new URL('http://example.invalid'+path).searchParams
      const cursor = params.has('cursor') ? Number(params.get('cursor')) : -1
      const rows = all.filter(item => item.at > cursor), items = rows.slice(0, 288)
      return { body: page(items, rows.length > 288 ? String(items.at(-1)!.at) : null), scope: 'minute-identity' }
    })
    const cache = storage(), session = createMarketSession(t.io, cache)
    await session.start()
    await vi.waitFor(() => expect(session.getSnapshot().candles).toHaveLength(320))
    expect(t.calls.filter(path => path.startsWith('/candles'))).toHaveLength(2)
    expect(session.getSnapshot().candleIntervalMs).toBe(MINUTE)
    expect(readMarketCache(cache, 'minute-identity').candles[0]).toMatchObject({ interval_ms: MINUTE, complete: true })
    t.feed({ ...state(), server_time: state().server_time + MINUTE })
    expect(t.calls.filter(path => path.startsWith('/candles'))).toHaveLength(2)
    t.feed({ ...state(), server_time: state().server_time + 5 * MINUTE })
    await vi.waitFor(() => expect(t.calls.filter(path => path.startsWith('/candles'))).toHaveLength(3))
    expect(t.calls.at(-1)).toContain(`cursor=${all.at(-3)!.at}`)
    session.dispose()
  })

  it('labels old server and old cached data as five-minute, never as real minute detail', async () => {
    const old = { ...state() }; delete old.candle_interval_ms
    old.current_candle = candle(0)
    expect(parseMarketState(old).candle_interval_ms).toBe(300_000)
    const cache = storage(), saved = emptyMarketCache('minute-identity')
    saved.candles = [{ case_id: 'minute-case', business_date: '2026-08-16', candles: [candle(0)] }]
    writeMarketCache(cache, saved)
    expect(readMarketCache(cache, 'minute-identity').candles[0]?.interval_ms).toBe(300_000)
    const t = transport(() => ({ body: page([candle(0)], null, 300_000), scope: 'minute-identity' }), old)
    const session = createMarketSession(t.io, cache)
    await session.start()
    await vi.waitFor(() => expect(session.getSnapshot().candles).toHaveLength(1))
    expect(session.getSnapshot().candleIntervalMs).toBe(300_000)
    session.dispose()
  })

  it('repairs a missed SSE minute from the last complete HTTP cursor despite later live points', async () => {
    const initial = { ...state(), current_candle: candle(600) }
    const all = Array.from({ length: 11 }, (_, i) => candle(595 + i))
    let live = false
    const t = transport(path => {
      const params = new URL('http://example.invalid' + path).searchParams
      const cursor = params.has('cursor') ? Number(params.get('cursor')) : -1
      return { body: page(all.filter(c => c.at > cursor && (live || c.at <= candle(600).at))), scope: 'minute-identity' }
    }, initial)
    const session = createMarketSession(t.io, storage())
    await session.start()
    await vi.waitFor(() => expect(session.getSnapshot().candles).toHaveLength(6))
    live = true
    for (const minute of [602, 603, 604, 605]) t.feed({ ...initial, server_time: candle(minute).at, current_candle: candle(minute) })
    await vi.waitFor(() => expect(session.getSnapshot().candles).toHaveLength(11))
    expect(t.calls.filter(path => path.startsWith('/candles'))).toHaveLength(2)
    expect(t.calls.at(-1)).toContain(`cursor=${candle(598).at}`)
    expect(session.getSnapshot().candles.some(c => c.at === candle(601).at)).toBe(true)
    session.dispose()
  })

  it('keeps complete cached history on first live adoption and failed HTTP, then repairs all missed minutes', async () => {
    const saved = emptyMarketCache('minute-identity'), cache = storage()
    saved.candles = [{ case_id: 'minute-case', business_date: '2026-08-16', interval_ms: MINUTE,
      complete: true, synced_through: candle(599).at, candles: Array.from({ length: 5 }, (_, i) => candle(595 + i)) }]
    writeMarketCache(cache, saved)
    const initial = { ...state(), current_candle: candle(600) }
    let failed = false
    const t = transport(path => {
      if (!failed) { failed = true; throw new Error('temporary cold-channel outage') }
      const cursor = Number(new URL('http://example.invalid' + path).searchParams.get('cursor'))
      return { body: page(Array.from({ length: 11 }, (_, i) => candle(595 + i)).filter(c => c.at > cursor)), scope: 'minute-identity' }
    }, initial)
    const session = createMarketSession(t.io, cache)
    await session.start()
    await vi.waitFor(() => expect(session.getSnapshot().chartError).not.toBeNull())
    expect(session.getSnapshot().candles.map(c => c.at)).toEqual(Array.from({ length: 6 }, (_, i) => candle(595 + i).at))
    expect(readMarketCache(cache, 'minute-identity').candles[0]).toMatchObject({ complete: true, synced_through: candle(599).at })
    for (const minute of [602, 603, 604, 605]) t.feed({ ...initial, server_time: candle(minute).at, current_candle: candle(minute) })
    await vi.waitFor(() => expect(session.getSnapshot().candles).toHaveLength(11))
    expect(t.calls.at(-1)).toContain(`cursor=${candle(597).at}`)
    expect(readMarketCache(cache, 'minute-identity').candles[0]?.synced_through).toBe(candle(605).at)
    expect(session.getSnapshot().chartError).toBeNull()
    session.dispose()
  })

  it('does not replace a final HTTP candle with an older provisional stream sample', async () => {
    const initial = state(); initial.current_candle = { ...candle(0), volume: 1 }
    const t = transport(() => ({ body: page([{ ...candle(0), volume: 2 }]), scope: 'minute-identity' }), initial)
    const session = createMarketSession(t.io, storage())
    await session.start()
    await vi.waitFor(() => expect(session.getSnapshot().candles[0]?.volume).toBe(2))
    session.dispose()
  })

  it('rejects looping pagination rather than repeatedly downloading or caching partial history', async () => {
    const t = transport(() => ({ body: page([candle(0)], 'again'), scope: 'minute-identity' }))
    const session = createMarketSession(t.io, storage())
    await session.start()
    await vi.waitFor(() => expect(session.getSnapshot().chartError).not.toBeNull())
    expect(t.calls.filter(path => path.startsWith('/candles'))).toHaveLength(2)
    expect(session.getSnapshot().candles).toHaveLength(0)
    session.dispose()
  })

  it('discards an old identity page and restarts the cold load after scope changes', async () => {
    let resolveOld!: (response: MarketResponse) => void, scope = 'minute-identity', requests = 0
    const t = transport(() => {
      requests++
      return requests === 1 ? new Promise<MarketResponse>(resolve => { resolveOld = resolve })
        : { body: page([{ ...candle(1), volume: 7 }]), scope }
    })
    const cached = storage(), session = createMarketSession(t.io, cached)
    await session.start()
    scope = 'replacement-identity'
    t.feed({ ...state(), server_time: state().server_time + 1 }, scope)
    resolveOld({ body: page([{ ...candle(0), volume: 99 }]), scope: 'minute-identity' })
    await vi.waitFor(() => expect(session.getSnapshot().candles[0]?.volume).toBe(7))
    expect(session.getSnapshot().scope).toBe(scope)
    expect(session.getSnapshot().candles).toHaveLength(1)
    expect(readMarketCache(cached, scope).candles[0]?.candles[0]?.volume).toBe(7)
    session.dispose()
  })
})
