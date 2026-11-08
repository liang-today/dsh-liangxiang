import { afterEach, describe, expect, it, vi } from 'vitest'
import { positionSound, createSettlementSoundTracker } from '../src/client/market/sound-feedback.ts'
import { createMarketSession, type MarketTransport } from '../src/client/market/market-client.ts'
import type { MarketPosition, MarketReceipt, MarketState } from '../src/shared/market-v1.ts'
import { createBackendFixture, type BackendFixture } from './helpers/backend.ts'

const position: MarketPosition = { side: 'long', amount: 10, submitted_at: 1, payout: null }
let backend: BackendFixture | undefined
afterEach(() => { backend?.close(); backend = undefined })
function current(): MarketState {
  backend = createBackendFixture({}, Date.UTC(2026, 10, 8, 1))
  return backend.service.marketState('sound-test')
}
function receipt(state: MarketState, returned = 15): MarketReceipt {
  return { id: 'receipt-sound', market_id: state.market!.id, business_date: state.market!.business_date,
    settled_at: state.market!.closes_at, invested_incense: 10, returned_incense: returned, pnl_incense: returned - 10,
    close_point: null, batches: [] }
}
function owned(state: MarketState): MarketState {
  const next = structuredClone(state)
  next.market!.batches[0]!.position = { ...position }
  return next
}
function closed(state: MarketState): MarketState {
  const next = structuredClone(state)
  next.market!.status = 'closed'
  return next
}

describe('confirmed market audio', () => {
  it('distinguishes changed investments and actual refunds from failures and no-ops', () => {
    expect(positionSound(null, position, 'long', 10, true)).toBe('invest')
    expect(positionSound(position, { ...position, amount: 20 }, 'long', 20, true)).toBe('invest')
    expect(positionSound(position, { ...position, side: 'short' }, 'short', 10, true)).toBe('invest')
    expect(positionSound(position, null, null, 0, true)).toBe('withdraw')
    expect(positionSound(position, { ...position }, 'long', 10, true)).toBeNull()
    expect(positionSound(null, null, null, 0, true)).toBeNull()
    expect(positionSound(null, position, 'short', 10, true)).toBeNull()
    expect(positionSound(position, null, null, 0, false)).toBeNull()
  })

  it('is silent on cached history, first load, zero payouts and repeated settled frames', () => {
    const live = owned(current()), done = closed(live), paid = receipt(live)
    const first = createSettlementSoundTracker()
    expect(first(done, 'a', [paid], true)).toBe(false)
    expect(first(done, 'a', [paid], true)).toBe(false)
    const tracker = createSettlementSoundTracker()
    expect(tracker(live, 'a', [paid], true)).toBe(false)
    expect(tracker(done, 'a', [], true)).toBe(false)
    expect(tracker(done, 'a', [paid], true)).toBe(true)
    expect(tracker(done, 'a', [paid], true)).toBe(false)
    const loser = createSettlementSoundTracker()
    loser(live, 'a', [], true)
    expect(loser(done, 'a', [receipt(live, 0)], true)).toBe(false)
  })

  it('uses a matching new receipt instead of wallet growth, and is quiet on hidden or different identities', () => {
    const live = owned(current()), done = closed(live), paid = receipt(live)
    const tracker = createSettlementSoundTracker()
    tracker(live, 'a', [], true)
    expect(tracker({ ...live, wallet: { ...live.wallet, available_incense: 500 } }, 'a', [], true)).toBe(false)
    expect(tracker(done, 'a', [{ ...paid, market_id: 'another-market' }], true)).toBe(false)
    tracker(done, 'a', [], false)
    expect(tracker(done, 'a', [paid], true)).toBe(false)
    const identity = createSettlementSoundTracker()
    identity(live, 'a', [], true)
    expect(identity(done, 'b', [paid], true)).toBe(false)
    expect(createSettlementSoundTracker()(done, 'b', [paid], true)).toBe(false)
  })

  it('recognizes rollover of a held market but not another user’s empty market', () => {
    const live = owned(current()), paid = receipt(live), next = structuredClone(live)
    next.market!.id = 'next-market'
    const tracker = createSettlementSoundTracker()
    tracker(live, 'a', [], true)
    expect(tracker(next, 'a', [paid], true)).toBe(true)
    const empty = createSettlementSoundTracker(), unheld = structuredClone(live)
    unheld.market!.batches[0]!.position = null
    empty(unheld, 'a', [], true)
    expect(empty(next, 'a', [paid], true)).toBe(false)
  })

  it('plays an accepted intent once after a lost response, never on rejection or reopening its retry', async () => {
    const state = current(), values = new Map<string, string>(), play = vi.fn()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    let lost = true, reject = false
    const transport: MarketTransport = {
      requestId: () => 'sound-intent', dispose() {}, events: () => ({ close() {} }),
      async request(path, intent) {
        if (path.startsWith('/history')) return { body: { schema_version: 1, receipts: [], next_cursor: null }, scope: 'a' }
        if (path.startsWith('/candles')) return { body: { schema_version: 1, case_id: state.market!.case_id, business_date: state.market!.business_date, interval_ms: 60_000, candles: [], next_cursor: null }, scope: 'a' }
        if (intent) {
          if (lost) { lost = false; throw new Error('response lost') }
          return { body: { accepted: !reject, reason: reject ? 'closed' : null, request_id: intent.request_id, state }, scope: 'a' }
        }
        return { body: state, scope: 'a' }
      },
    }
    const session = createMarketSession(transport, storage)
    await session.start()
    const intent = { market_id: state.market!.id, batch: 1 as const, side: 'long' as const, amount: 10 }
    await session.submit(intent, play)
    expect(play).not.toHaveBeenCalled()
    await session.retryPending()
    await session.retryPending()
    expect(play).toHaveBeenCalledTimes(1)
    reject = true
    await session.submit(intent, play)
    expect(play).toHaveBeenCalledTimes(1)
    lost = true; reject = false
    await session.submit(intent, play)
    session.dispose()
    const reopened = createMarketSession(transport, storage)
    await reopened.start()
    await reopened.retryPending()
    expect(play).toHaveBeenCalledTimes(1)
    reopened.dispose()
  })

  it('isolates audio callback failures from the accepted server receipt', async () => {
    const state = current(), values = new Map<string, string>()
    const transport: MarketTransport = {
      requestId: () => 'sound-callback-failure', dispose() {}, events: () => ({ close() {} }),
      async request(path, intent) {
        return { scope: 'a', body: intent ? { accepted: true, reason: null, request_id: intent.request_id, state }
          : path.startsWith('/history') ? { schema_version: 1, receipts: [], next_cursor: null }
          : path.startsWith('/candles') ? { schema_version: 1, case_id: state.market!.case_id, business_date: state.market!.business_date, interval_ms: 60_000, candles: [], next_cursor: null } : state }
      },
    }
    const session = createMarketSession(transport, { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } })
    await session.start()
    await session.submit({ market_id: state.market!.id, batch: 1, side: 'long', amount: 10 }, () => { throw new Error('speaker unavailable') })
    expect(session.getSnapshot()).toMatchObject({ pending: null, error: null, status: 'live' })
    session.dispose()
  })
})
