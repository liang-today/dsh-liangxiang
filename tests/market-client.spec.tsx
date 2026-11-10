import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import type { ReactElement } from 'react'
import { MARKET_CACHE_MAX_BYTES, type MarketBatch, type MarketState, type MarketReceipt } from '../src/shared/market-v1.ts'
import { compareMarketPoints, expectedReturn, positionMood, chartRange } from '../src/client/market/chart-model.ts'
import { boundedMarketCache, cacheBytes, emptyMarketCache, MARKET_CACHE_KEY, readMarketCache, writeMarketCache, readMarketAnimation, writeMarketAnimation, type MarketStorage } from '../src/client/market/market-cache.ts'
import { createMarketSession, type MarketResponse, type MarketSession, type MarketTransport, type MarketView } from '../src/client/market/market-client.ts'
import { MarketDialog } from '../src/client/market/MarketDialog.tsx'
import { wireToViewState } from '../src/client/store.ts'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { parseWireState } from '../src/shared/wire.ts'
import { LIANGZI_POLICY_VERSION } from '../src/domain/liangzi.ts'

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup(element: ReactElement): string }
function state(): MarketState {
  const schedule = [[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const
  return { schema_version: 1, server_time: DAY + 10 * HOUR, soft_trust: true,
    wallet: { available_incense: 100, frozen_incense: 0, total_incense: 100, token_remainder: 49_999, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'case-2026-11-06', at: DAY + 10 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 },
    market: { id: 'market-2026-11-06', case_id: 'case-2026-11-06', business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: schedule.map(([open, lock, reference], index) => ({ batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR, status: index === 0 ? 'open' : 'pending', reference: null, long_incense: 0, short_incense: 0, position: null, result: null })) }
  }
}
function batch(side: 'long' | 'short' = 'long'): MarketBatch {
  return { ...state().market!.batches[0]!, status: 'live', reference: { case_id: 'case-2026-11-06', at: DAY + 12 * HOUR, up_votes: 50, down_votes: 50, sequence: 1 }, long_incense: 30, short_incense: 20, position: { side, amount: 10, submitted_at: DAY + 10 * HOUR, payout: null } }
}
function memoryStorage(): MarketStorage {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
function receipt(index: number): MarketReceipt {
  return { id: `receipt-${index}`, market_id: `market-${index}`, business_date: '2026-11-06', settled_at: DAY + index, invested_incense: 10, returned_incense: 20, pnl_incense: 10, close_point: null,
    batches: [{ batch: 1, side: 'long', amount: 10, payout: 20, result: 'long', reference: null }] }
}

describe('market visual accounting', () => {
  it('does not mistake lifetime wallet funds for today earnings or reset carried progress', () => {
    const service = new FakeAuthoritativeLiangService({ timezone: 'UTC', tokenPerIncense: 50_000, snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '测试梁案' }, { now: () => DAY + 10 * HOUR }, () => undefined)
    service.markReadyMemoryOnly('test')
    const frame = service.getWireState()
    const wallet = { ...state().wallet, available_incense: 85, frozen_incense: 20, total_incense: 105 }
    const parsed = parseWireState({ ...frame, authorityMode: 'DEV_STAGING_ONLY', personal: { ...frame.personal, effectiveTokensToday: 500_000, usedIncenseToday: 15, remainingIncense: 85, earnedIncenseToday: 10, wallet } })
    const view = wireToViewState(parsed, 'live')
    expect(view.personal.earnedIncenseToday).toBe(10)
    expect(view.personal.usedIncenseToday).toBe(15)
    expect(view.personal.remainingIncense).toBe(85)
    expect(view.personal.tokenRemainder).toBe(49_999)
    expect(view.personal.tokensToNextIncense).toBe(1)
  })
  it('shows finalized usage awaiting acknowledgment as progress, never spendable incense', () => {
    const service = new FakeAuthoritativeLiangService({ timezone: 'UTC', tokenPerIncense: 50_000, snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '测试梁案' }, { now: () => DAY + 10 * HOUR }, () => undefined)
    service.markReadyMemoryOnly('test')
    const frame = service.getWireState()
    const parsed = parseWireState({ ...frame, authorityMode: 'DEV_STAGING_ONLY', personal: { ...frame.personal, effectiveTokensToday: 550_002, confirmedEffectiveTokensToday: 500_000, usedIncenseToday: 15, remainingIncense: 100, earnedIncenseToday: 10, wallet: state().wallet } })
    const view = wireToViewState(parsed, 'live')
    expect(view.personal.remainingIncense).toBe(100)
    expect(view.personal.earnedIncenseToday).toBe(10)
    expect(view.observedEarnedIncenseToday).toBe(12)
    expect(view.personal.tokenRemainder).toBe(1)
    expect(view.personal.tokensToNextIncense).toBe(49_999)
  })
  it('uses the right direction for short positions and seals the final state', () => {
    const s = state(), b = batch('short')
    expect(positionMood(b, s.current_point)).toBe('behind')
    expect(positionMood(b, { ...s.current_point!, up_votes: 45, down_votes: 55 })).toBe('ahead')
    expect(positionMood({ ...b, result: 'short' }, s.current_point)).toBe('won')
    expect(positionMood({ ...b, reference: null }, s.current_point)).toBe('waiting')
  })
  it('compares raw fractions past six displayed decimals and refuses another case', () => {
    const reference = { ...state().current_point!, up_votes: 1_000_000_000, down_votes: 1_000_000_000 }
    expect(compareMarketPoints({ ...reference, up_votes: 1_000_000_001 }, reference)).toBe(1)
    expect(compareMarketPoints({ ...reference, case_id: 'another-case' }, reference)).toBeNull()
    expect(compareMarketPoints({ ...reference, up_votes: 0, down_votes: 0 }, reference)).toBeNull()
  })
  it('pool payout does not grow linearly as the price moves further', () => {
    const b = batch(), point = state().current_point!
    expect(expectedReturn(b, point)).toBe(16)
    expect(expectedReturn(b, { ...point, up_votes: 99, down_votes: 1 })).toBe(16)
    expect(expectedReturn(b, { ...point, up_votes: 40, down_votes: 60 })).toBe(0)
    expect(expectedReturn(b, { ...point, up_votes: 50, down_votes: 50 })).toBe(10)
  })
  it('includes reference and live prices in the chart range', () => {
    const result = chartRange([], [batch().reference, state().current_point])
    expect(result.min).toBeLessThan(.5)
    expect(result.max).toBeGreaterThan(.55)
  })
})

describe('bounded non-authoritative market cache', () => {
  it('caps candles, receipts and total UTF16 storage, and never stores a wallet', () => {
    const cache = emptyMarketCache('identity-a')
    cache.receipts = Array.from({ length: 40 }, (_, i) => receipt(i))
    cache.candles = Array.from({ length: 12 }, (_, i) => ({ case_id: `case-${i}`, business_date: `2026-11-${String(i + 1).padStart(2, '0')}`, candles: [] }))
    const bounded = boundedMarketCache(cache)
    expect(bounded.receipts).toHaveLength(30)
    expect(bounded.candles).toHaveLength(7)
    expect(cacheBytes(JSON.stringify(bounded))).toBeLessThanOrEqual(MARKET_CACHE_MAX_BYTES)
    expect(JSON.stringify(bounded)).not.toContain('available_incense')
  })
  it('isolates identities and handles corrupt or oversized cache without throwing', () => {
    const storage = memoryStorage(), cache = emptyMarketCache('identity-a')
    cache.receipts = [receipt(1)]
    writeMarketCache(storage, cache)
    expect(readMarketCache(storage, 'identity-b').receipts).toEqual([])
    expect(readMarketCache(storage, 'identity-a').receipts).toHaveLength(1)
    storage.setItem(MARKET_CACHE_KEY, '{broken')
    expect(readMarketCache(storage, 'identity-a').receipts).toEqual([])
    storage.setItem(MARKET_CACHE_KEY, 'x'.repeat(MARKET_CACHE_MAX_BYTES))
    expect(readMarketCache(storage, 'identity-a').receipts).toEqual([])
    expect(storage.getItem(MARKET_CACHE_KEY)).toBeNull()
  })
  it('defaults to system motion preference and persists only the local choice', () => {
    const storage = memoryStorage()
    expect(readMarketAnimation(storage, true)).toBe(false)
    writeMarketAnimation(storage, true)
    expect(readMarketAnimation(storage, true)).toBe(true)
    writeMarketAnimation(storage, false)
    expect(readMarketAnimation(storage, false)).toBe(false)
  })
})

describe('market transport state machine', () => {
  function fixture() {
    const current = state(), calls: string[] = [], ids: string[] = []
    let handler: ((body: unknown, scope: string) => void) | null = null
    let uncertain = false, closed = 0, disposed = false
    const transport: MarketTransport = {
      async request(path, intent): Promise<MarketResponse> {
        calls.push(path)
        if (path.startsWith('/candles')) return { body: { schema_version: 1, case_id: current.market!.case_id, business_date: current.market!.business_date, interval_ms: 300_000, candles: [], next_cursor: null }, scope: 'identity-a' }
        if (path.startsWith('/history')) return { body: { schema_version: 1, receipts: [], next_cursor: null }, scope: 'identity-a' }
        if (intent) {
          ids.push(intent.request_id)
          if (uncertain) { uncertain = false; throw new Error('network interrupted') }
          return { body: { accepted: true, reason: null, request_id: intent.request_id, state: current }, scope: 'identity-a' }
        }
        return { body: current, scope: 'identity-a' }
      },
      events(onState) { handler = onState; return { close() { closed++ } } },
      requestId: () => `request-${ids.length + 1}`,
      dispose() { disposed = true },
    }
    return { current, calls, ids, transport, setUncertain: () => { uncertain = true }, feed: (data: MarketState, scope = 'identity-a') => handler?.(data, scope), closed: () => closed, disposed: () => disposed }
  }
  it('starts with only today candles and a twenty-receipt page, without polling', async () => {
    const f = fixture(), session = createMarketSession(f.transport, memoryStorage())
    await session.start()
    expect(f.calls).toHaveLength(3)
    expect(f.calls.find(path => path.startsWith('/candles'))).toContain('limit=288')
    expect(f.calls.find(path => path.startsWith('/history'))).toContain('limit=20')
    f.feed({ ...f.current, server_time: f.current.server_time + 1_000 })
    expect(f.calls).toHaveLength(3)
    session.dispose()
    expect(f.closed()).toBe(1)
    expect(f.disposed()).toBe(true)
  })

  it('repairs a failed candle read automatically without adding healthy requests or orders', async () => {
    vi.useFakeTimers()
    const f = fixture(), request = f.transport.request
    let candleReads = 0
    f.transport.request = async (path, intent) => {
      if (path.startsWith('/candles') && ++candleReads === 1) throw new DOMException('aborted', 'AbortError')
      return request(path, intent)
    }
    const session = createMarketSession(f.transport, memoryStorage())
    try {
      await session.start()
      expect(session.getSnapshot().chartError).not.toBeNull()
      await vi.advanceTimersByTimeAsync(4_999)
      expect(candleReads).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(candleReads).toBe(2)
      expect(session.getSnapshot().chartError).toBeNull()
      f.feed({ ...f.current, server_time: f.current.server_time + 1_000 })
      await vi.advanceTimersByTimeAsync(30_000)
      expect(candleReads).toBe(2)
      expect(f.ids).toEqual([])
    } finally { session.dispose(); vi.useRealTimers() }
  })

  it.each(['identity', 'case'] as const)('does not let an old position acknowledgment replace the current %s or erase its pending intent', async change => {
    const f = fixture(), storage = memoryStorage(), request = f.transport.request
    const old = structuredClone(f.current)
    let finish!: (response: MarketResponse) => void
    f.transport.request = (path, intent) => intent ? new Promise(resolve => { finish = resolve }) : request(path)
    const session = createMarketSession(f.transport, storage)
    try {
      await session.start()
      const sending = session.submit({ market_id: old.market!.id, batch: 1, side: 'long', amount: 5 })
      const next: MarketState = { ...old, server_time: old.server_time + 86_400_000,
        wallet: { ...old.wallet, version: 2 },
        ...(change === 'case' ? {
          current_point: { ...old.current_point!, case_id: 'next-case', at: old.server_time + 86_400_000 },
          market: { ...old.market!, id: 'next-market', case_id: 'next-case', business_date: '2026-11-07',
            opens_at: old.market!.opens_at + 86_400_000, closes_at: old.market!.closes_at + 86_400_000,
            batches: old.market!.batches.map(batch => ({ ...batch, opens_at: batch.opens_at + 86_400_000,
              locks_at: batch.locks_at + 86_400_000, reference_at: batch.reference_at + 86_400_000 })) },
        } : {}) }
      f.feed(next, change === 'identity' ? 'identity-b' : 'identity-a')
      finish({ scope: 'identity-a', body: { accepted: true, reason: null, request_id: 'request-1',
        state: { ...old, wallet: { ...old.wallet, version: 9 } } } })
      await sending
      expect(session.getSnapshot().scope).toBe(change === 'identity' ? 'identity-b' : 'identity-a')
      expect(session.getSnapshot().state).toEqual(next)
      expect(readMarketCache(storage, 'identity-a').pending?.request_id).toBe('request-1')
      if (change === 'case') {
        f.transport.request = async (_path, intent) => ({ scope: 'identity-a', body: {
          accepted: false, reason: 'market closed', request_id: intent!.request_id, state: next,
        } })
        await session.retryPending()
        expect(session.getSnapshot().pending).toBeNull()
        expect(session.getSnapshot().state).toEqual(next)
      }
    } finally { session.dispose() }
  })
  function historyFixture(storage = memoryStorage()) {
    const f = fixture(), historyCalls: string[] = []
    const request = f.transport.request.bind(f.transport)
    f.transport.request = async (path, intent) => {
      if (!path.startsWith('/history')) return request(path, intent)
      historyCalls.push(path)
      const before = Number(new URLSearchParams(path.split('?')[1]).get('cursor') ?? 101)
      const remaining = Array.from({ length: 100 }, (_, i) => 100 - i).filter(index => index < before)
      const indices = remaining.slice(0, 20)
      return { scope: 'identity-a', body: { schema_version: 1, receipts: indices.map(receipt),
        next_cursor: remaining.length > indices.length ? String(indices.at(-1)) : null } }
    }
    return { ...f, historyCalls, storage, session: createMarketSession(f.transport, storage) }
  }
  it('pages through a hundred receipts in both directions while retaining only a page and thirty cached receipts', async () => {
    const f = historyFixture()
    await f.session.start()
    for (let page = 1; page <= 5; page++) {
      expect(f.session.getSnapshot()).toMatchObject({ historyPage: page })
      expect(f.session.getSnapshot().receipts.map(row => row.id))
        .toEqual(Array.from({ length: 20 }, (_, i) => `receipt-${101 - (page - 1) * 20 - i - 1}`))
      if (page < 5) await f.session.loadHistory(true)
    }
    expect(f.session.getSnapshot().nextCursor).toBeNull()
    for (let page = 4; page >= 1; page--) {
      await f.session.loadHistory('newer')
      expect(f.session.getSnapshot()).toMatchObject({ historyPage: page })
      expect(f.session.getSnapshot().receipts[0]!.id).toBe(`receipt-${100 - (page - 1) * 20}`)
    }
    const calls = f.historyCalls.length
    await f.session.loadHistory('newer')
    expect(f.historyCalls).toHaveLength(calls)
    expect(readMarketCache(f.storage, 'identity-a').receipts.map(row => row.id))
      .toEqual(Array.from({ length: 30 }, (_, i) => `receipt-${100 - i}`))
    f.session.dispose()
  })
  it('reopens at the newest single page instead of traversing all persisted or previously viewed history', async () => {
    const storage = memoryStorage(), first = historyFixture(storage)
    await first.session.start()
    for (let i = 0; i < 4; i++) await first.session.loadHistory(true)
    first.session.dispose()
    const reopened = historyFixture(storage)
    await reopened.session.start()
    expect(reopened.historyCalls).toEqual(['/history?limit=20'])
    expect(reopened.session.getSnapshot()).toMatchObject({ historyPage: 1 })
    expect(reopened.session.getSnapshot().receipts).toHaveLength(20)
    expect(reopened.session.getSnapshot().receipts[0]!.id).toBe('receipt-100')
    reopened.session.dispose()
  })
  it('discards a slow old-identity history page without clearing the new identity loading state', async () => {
    const f = fixture(), storage = memoryStorage(), request = f.transport.request.bind(f.transport)
    let scope = 'identity-a', started!: () => void, finishOld!: (value: MarketResponse) => void,
      finishNew!: (value: MarketResponse) => void
    const requested = new Promise<void>(resolve => { started = resolve })
    f.transport.request = (path, intent) => {
      if (!path.startsWith('/history')) return request(path, intent)
      if (scope === 'identity-a') return new Promise(resolve => { finishOld = resolve; started() })
      return new Promise(resolve => { finishNew = resolve })
    }
    const session = createMarketSession(f.transport, storage), starting = session.start()
    await requested
    scope = 'identity-b'
    f.feed({ ...f.current, wallet: { ...f.current.wallet, version: 2 } }, scope)
    expect(session.getSnapshot().scope).toBe('identity-b')
    await expect.poll(() => typeof finishNew).toBe('function')
    finishOld({ scope: 'identity-a', body: { schema_version: 1, receipts: [receipt(100)], next_cursor: null } })
    await starting
    expect(session.getSnapshot()).toMatchObject({ scope: 'identity-b', historyLoading: true })
    expect(session.getSnapshot().receipts).toEqual([])
    finishNew({ scope: 'identity-b', body: { schema_version: 1, receipts: [receipt(200)], next_cursor: null } })
    await expect.poll(() => session.getSnapshot().historyLoading).toBe(false)
    expect(session.getSnapshot().receipts).toEqual([receipt(200)])
    expect(readMarketCache(storage, 'identity-b').receipts).toEqual([receipt(200)])
    session.dispose()
  })
  it('persists uncertainty and retries the exact request, never a fresh id', async () => {
    const f = fixture(), storage = memoryStorage(), session = createMarketSession(f.transport, storage)
    await session.start(); f.setUncertain()
    await session.submit({ market_id: f.current.market!.id, batch: 1, side: 'short', amount: 10 })
    expect(session.getSnapshot().pending?.request_id).toBe('request-1')
    expect(readMarketCache(storage, 'identity-a').pending?.request_id).toBe('request-1')
    f.feed({ ...f.current, server_time: f.current.server_time + 1 })
    expect(session.getSnapshot().error).toContain('核对原请求')
    expect(session.getSnapshot().pending?.request_id).toBe('request-1')
    await session.retryPending()
    expect(f.ids).toEqual(['request-1', 'request-1'])
    expect(session.getSnapshot().pending).toBeNull()
    session.dispose()
  })
  it.each([0, -60_000])('adopts a higher-wallet-version position receipt even when its server timestamp changes by %ims', async offset => {
    const f = fixture()
    f.current.wallet = { ...f.current.wallet, available_incense: 95, frozen_incense: 5, version: 3 }
    f.current.market!.batches[0]!.position = { side: 'long', amount: 5, submitted_at: f.current.server_time, payout: null }
    const session = createMarketSession(f.transport, memoryStorage())
    await session.start()
    const confirmed: MarketState = { ...f.current, server_time: f.current.server_time + offset,
      wallet: { ...f.current.wallet, available_incense: 91, frozen_incense: 9, version: 4 },
      market: { ...f.current.market!, batches: f.current.market!.batches.map(batch => batch.batch === 1
        ? { ...batch, position: { side: 'short', amount: 9, submitted_at: f.current.server_time + offset, payout: null } } : batch) } }
    const request = f.transport.request
    f.transport.request = async (path, intent) => intent
      ? { body: { accepted: true, reason: null, request_id: intent.request_id, state: confirmed }, scope: 'identity-a' }
      : request(path)
    await session.submit({ market_id: confirmed.market!.id, batch: 1, side: 'short', amount: 9 })
    const view = session.getSnapshot()
    expect(view.state?.wallet).toEqual(confirmed.wallet)
    expect(view.state?.market?.batches[0]?.position).toEqual(confirmed.market!.batches[0]!.position)
    expect(view.state?.server_time).toBe(confirmed.server_time)
    expect(view.pending).toBeNull()
    expect(view.sending).toBe(false)
    expect(view.error).toBeNull()
    session.dispose()
  })
  it('refuses a newer-timestamp SSE with an older wallet version so balance and own position cannot roll back', async () => {
    const f = fixture()
    f.current.wallet = { ...f.current.wallet, available_incense: 91, frozen_incense: 9, version: 4 }
    f.current.market!.batches[0]!.position = { side: 'short', amount: 9, submitted_at: f.current.server_time, payout: null }
    const session = createMarketSession(f.transport, memoryStorage())
    await session.start()
    const confirmed = session.getSnapshot().state
    const old: MarketState = { ...f.current, server_time: f.current.server_time + HOUR,
      wallet: { ...f.current.wallet, available_incense: 95, frozen_incense: 5, version: 3 },
      market: { ...f.current.market!, batches: f.current.market!.batches.map(batch => batch.batch === 1
        ? { ...batch, position: { side: 'long', amount: 5, submitted_at: f.current.server_time, payout: null } } : batch) } }
    f.feed(old)
    expect(session.getSnapshot().state).toBe(confirmed)
    expect(session.getSnapshot().state?.wallet.version).toBe(4)
    expect(session.getSnapshot().state?.market?.batches[0]?.position).toMatchObject({ side: 'short', amount: 9 })
    session.dispose()
  })
  it('retains timestamp protection at the same wallet version and accepts a different identity own version and cache', async () => {
    const f = fixture(), storage = memoryStorage()
    f.current.wallet.version = 4
    const session = createMarketSession(f.transport, storage)
    await session.start()
    const confirmed = session.getSnapshot().state
    f.feed({ ...f.current, server_time: f.current.server_time - 1_000 })
    expect(session.getSnapshot().state).toBe(confirmed)
    const otherCache = emptyMarketCache('identity-b')
    otherCache.receipts = [receipt(2)]
    writeMarketCache(storage, otherCache)
    const other: MarketState = { ...f.current, server_time: f.current.server_time - 60_000, wallet: { ...f.current.wallet, version: 1 } }
    f.feed(other, 'identity-b')
    expect(session.getSnapshot().scope).toBe('identity-b')
    expect(session.getSnapshot().state?.wallet.version).toBe(1)
    expect(session.getSnapshot().state?.server_time).toBe(other.server_time)
    expect(session.getSnapshot().receipts).toEqual([receipt(2)])
    session.dispose()
  })
  it('does not persist private cached history without an identity scope', async () => {
    const f = fixture(), storage = memoryStorage()
    const request = f.transport.request
    f.transport.request = async (...args) => ({ ...await request(...args), scope: '' })
    const session = createMarketSession(f.transport, storage)
    await session.start()
    expect(storage.getItem(MARKET_CACHE_KEY)).toBeNull()
    session.dispose()
  })
})

describe('market dialog rendering', () => {
  it('shows all three public side pools exactly, independently of personal funds, with an unknown loading total', () => {
    for (const [amounts, exact, compact] of [
      [[0, 0, 0, 0, 0, 0], '0', '0'],
      [[10, 20, 30, 40, 50, 60], '210', '210'],
      [Array(6).fill(Number.MAX_SAFE_INTEGER), '54,043,195,528,445,946', '5.404亿亿'],
      [null, '—', '—'],
    ] as const) {
      const sample = state()
      if (amounts) sample.market!.batches.forEach((batch, i) => { batch.long_incense = amounts[i * 2]!; batch.short_incense = amounts[i * 2 + 1]! })
      const view: MarketView = { state: amounts ? sample : null, status: amounts ? 'live' : 'loading', candles: [], receipts: [], historyPage: 1, nextCursor: null, pending: null, sending: false, historyLoading: false, error: null, chartError: null, scope: 'identity-a' }
      const session: MarketSession = { getSnapshot: () => view, subscribe: () => () => undefined, start: async () => {}, submit: async () => {}, retryPending: async () => {}, loadHistory: async () => {}, dispose: () => {} }
      const html = renderToStaticMarkup(<MarketDialog reducedMotion online onClose={() => {}} session={session} />)
      const total = html.match(/data-liangxiang-market-total="">([\s\S]*?)<\/strong>/)?.[1]
      if (amounts) {
        expect(total).toContain(`title="${exact}"`)
        expect(total).toContain(`>${compact}<`)
        expect(html.indexOf('今日香池')).toBeLessThan(html.indexOf('data-liangxiang-market-pool'))
        expect(html).toContain('午夜揭晓')
      } else {
        expect(total).toBeUndefined()
        expect(html).toContain('data-liangxiang-market-available=""><span title="—"')
      }
      expect(sample.wallet.available_incense).toBe(100)
    }
  })

  it('exposes frozen funds, direction controls, motion toggle and readable pool semantics', () => {
    const s = state()
    const view: MarketView = { state: s, status: 'live', candles: [], receipts: [], historyPage: 1, nextCursor: null, pending: null, sending: false, historyLoading: false, error: null, chartError: null, scope: 'identity-a' }
    const session: MarketSession = { getSnapshot: () => view, subscribe: () => () => undefined, start: async () => {}, submit: async () => {}, retryPending: async () => {}, loadHistory: async () => {}, dispose: () => {} }
    const html = renderToStaticMarkup(<MarketDialog reducedMotion online onClose={() => {}} session={session} />)
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="交易动画"')
    expect(html).toContain('data-animated="false"')
    expect(html).toContain('早盘总投入香火')
    expect(html).toContain('冻结')
    expect(html).toContain('梁股')
    expect(html).toContain('香火市场')
    expect(html).not.toContain('三次定线 · 午夜一起揭晓')
    expect(html).toContain('data-liangxiang-market-main-whale')
    const shown = renderToStaticMarkup(<MarketDialog reducedMotion online onClose={() => {}} session={session}
      presentation={{ caseId: s.market!.case_id, policyId: LIANGZI_POLICY_VERSION, title: '同案标题' }} />)
    expect(shown).not.toContain('同案标题')
    expect(shown).toContain('<b>· 梁总</b>')
    const stale = renderToStaticMarkup(<MarketDialog reducedMotion online onClose={() => {}} session={session}
      presentation={{ caseId: 'another-case', policyId: LIANGZI_POLICY_VERSION, title: '旧案标题' }} />)
    expect(stale).not.toContain('旧案标题')
    expect(stale).not.toContain('<b>· 梁总</b>')
  })
})
