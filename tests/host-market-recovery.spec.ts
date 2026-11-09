import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendLiangService } from '../src/host/backend-service.ts'
import { createBackendClient, type BackendClient } from '../src/host/backend-client.ts'
import { BackendClientError } from '../src/host/backend-client.ts'
import type { MarketState } from '../src/shared/market-v1.ts'
import { createBackendFixture, DAY_MS } from './helpers/backend.ts'

const READER = 'inst-market-recovery-reader'
const OTHER = 'inst-market-recovery-other'
const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

async function recoveryHarness(snapshotSeconds = 1) {
  const fixture = createBackendFixture({ LIANGXIANG_SNAPSHOT_SECONDS: String(snapshotSeconds) })
  cleanups.push(() => fixture.close())
  fixture.grantIncense(READER, 30)
  fixture.grantIncense(OTHER, 30)
  const active = fixture.service.ensureActiveCase()
  fixture.service.vote(OTHER, { case_id: active.id, vote_type: 'down', count: 1, request_id: 'market-recovery-seed' })
  const requests: string[] = []
  const streams: Array<Parameters<NonNullable<BackendClient['subscribeEvents']>>[1]> = []
  const client = createBackendClient({ baseUrl: 'http://127.0.0.1:4180', fetchImpl: (async input => {
    const path = new URL(String(input)).pathname
    requests.push(path)
    const payload = path.endsWith('/bootstrap') ? fixture.service.bootstrap(READER)
      : path.endsWith('/snapshot') ? fixture.service.snapshotResponse()
      : path.endsWith('/market') ? fixture.service.marketState(READER)
      : path.endsWith('/me/daily-state') ? fixture.service.dailyState(READER)
      : (() => { throw new Error(`unexpected mocked request ${path}`) })()
    return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch })
  client.subscribeEvents = (_id, handlers) => { streams.push(handlers); handlers.onStatus('unsupported'); return () => undefined }
  const service = new BackendLiangService({ client, timezone: 'Asia/Shanghai', clock: fixture.clock, warn: () => undefined })
  cleanups.push(() => service.dispose())
  service.attachIdentity(READER)
  await service.refreshBootstrap()
  const initial = await service.market()
  const marketReads = () => requests.filter(path => path.endsWith('/market')).length
  const otherVote = () => fixture.service.vote(OTHER, { case_id: initial.market!.case_id,
    vote_type: 'up', count: 7, request_id: 'market-recovery-seven' })
  return { fixture, client, service, initial, streams, requests, marketReads, otherVote }
}

describe('market recovery without a healthy cloud stream', () => {
  it('applies a polled public price without waiting for a private wallet or market read', async () => {
    const h = await recoveryHarness()
    h.otherVote()
    await h.service.refreshSnapshot()
    expect(h.service.getWireState().global.upVotes).toBe(7)
    expect(h.service.cachedMarketState()?.current_point?.up_votes).toBe(7)
    expect(h.marketReads()).toBe(1)
  })

  it('recovers another voter candle, pool and phase while keeping the reader wallet unchanged', async () => {
    const h = await recoveryHarness()
    const wallet = h.initial.wallet
    h.otherVote()
    expect(h.fixture.service.setMarketPosition(OTHER, { market_id: h.initial.market!.id,
      batch: 2, side: 'long', amount: 5, request_id: 'market-recovery-other-position' }).accepted).toBe(true)
    h.fixture.clock.advance(5_000)
    h.service.tick()
    await vi.waitFor(() => expect(h.service.cachedMarketState()?.current_candle?.volume).toBe(8))
    expect(h.service.cachedMarketState()?.market?.batches[1]?.long_incense).toBe(5)
    expect(h.service.cachedMarketState()?.wallet).toEqual(wallet)
    h.fixture.clock.advance(4 * 3_600_000)
    h.service.tick()
    // Only the long pool has funds, so the backend voids this batch at lock.
    await vi.waitFor(() => expect(h.service.cachedMarketState()?.market?.batches[1]?.status).toBe('void'))
    expect(h.requests.every(path => !path.endsWith('/token-claims') && !path.endsWith('/market/position'))).toBe(true)
  })

  it('bounds fallback reads by elapsed time and server cadence, not repeated tick calls', async () => {
    const h = await recoveryHarness(17)
    h.fixture.clock.advance(17_000)
    h.service.tick()
    await vi.waitFor(() => expect(h.marketReads()).toBe(2))
    for (let i = 0; i < 80; i++) h.service.tick()
    await h.service.refreshSnapshot()
    expect(h.marketReads()).toBe(2)
    h.fixture.clock.advance(16_999)
    h.service.tick()
    await h.service.refreshSnapshot()
    expect(h.marketReads()).toBe(2)
    h.fixture.clock.advance(1)
    h.service.tick()
    await vi.waitFor(() => expect(h.marketReads()).toBe(3))
  })

  it('adds no market read while the cloud stream is healthy', async () => {
    const h = await recoveryHarness()
    const stream = h.streams[0]!
    stream.onStatus('connected')
    stream.onEvent({ schema_version: 1, epoch: 'recovery-healthy', revision: 1,
      server_time: h.initial.server_time, market_state: h.initial })
    h.fixture.clock.advance(60_000)
    for (let i = 0; i < 10; i++) h.service.tick()
    await h.service.refreshPersonal()
    expect(h.marketReads()).toBe(1)
    expect(h.requests.filter(path => path.endsWith('/snapshot'))).toHaveLength(0)
  })

  it('marks a failed market read unavailable, bounds reconnect attempts and later recovers without a transaction', async () => {
    const h = await recoveryHarness()
    const original = h.client.market!
    const read = vi.fn(original)
    h.client.market = read
    read.mockRejectedValueOnce(new BackendClientError('market read failed', 503, 'unavailable'))
    let unavailableFrames = 0
    h.service.subscribe(() => { if (h.service.cachedMarketState() === null) unavailableFrames++ })
    h.fixture.clock.advance(5_000)
    h.service.tick()
    await vi.waitFor(() => expect(unavailableFrames).toBeGreaterThan(0))
    expect(h.service.cachedMarketState()).toBeNull()
    expect(h.service.getWireState().authorityAvailable).toBe(true)
    for (let i = 0; i < 10; i++) await expect(h.service.market()).rejects.toThrow('market read failed')
    expect(read).toHaveBeenCalledTimes(1)
    h.fixture.clock.advance(5_000)
    h.service.tick()
    await vi.waitFor(() => expect(h.service.cachedMarketState()).not.toBeNull())
    expect(read).toHaveBeenCalledTimes(2)
    expect(h.service.cachedMarketState()?.wallet).toEqual(h.initial.wallet)
  })

  it('does not apply a late read across business-date rollover or share it with the next case', async () => {
    const h = await recoveryHarness()
    const original = h.client.market!
    let finish!: (state: MarketState) => void
    h.client.market = async () => new Promise<MarketState>(resolve => { finish = resolve })
    const late = h.service.market()
    h.fixture.clock.advance(DAY_MS)
    await h.service.refreshBootstrap()
    expect(h.service.cachedMarketState()).toBeNull()
    h.client.market = original
    const fresh = await h.service.market()
    expect(fresh.market?.case_id).not.toBe(h.initial.market?.case_id)
    const rejected = expect(late).rejects.toThrow()
    finish(h.initial)
    await rejected
    expect(h.service.cachedMarketState()?.market?.case_id).toBe(fresh.market?.case_id)
  })

  it('shares a pending recovery with concurrent browser reads and ignores a late same-wallet response after fresh SSE', async () => {
    const h = await recoveryHarness()
    let finish!: (state: MarketState) => void
    const read = vi.fn(async () => new Promise<MarketState>(resolve => { finish = resolve }))
    h.client.market = read
    h.fixture.clock.advance(5_000)
    h.service.tick()
    const second = h.service.market(), third = h.service.market()
    expect(read).toHaveBeenCalledTimes(1)
    const newer = { ...h.initial, server_time: h.fixture.clock.now(), market: { ...h.initial.market!,
      batches: h.initial.market!.batches.map(batch => ({ ...batch, long_incense: 9 })) } }
    h.streams[0]!.onStatus('connected')
    h.streams[0]!.onEvent({ schema_version: 1, epoch: 'market-recovery-newer', revision: 1,
      server_time: newer.server_time, market_state: newer })
    finish(h.initial)
    await Promise.all([second, third])
    expect(h.service.cachedMarketState()?.market?.batches[1]?.long_incense).toBe(9)
  })

  it('invalidates pending market reads after an operator replaces the case on the same day', async () => {
    const h = await recoveryHarness()
    let finish!: (state: MarketState) => void
    h.client.market = async () => new Promise<MarketState>(resolve => { finish = resolve })
    const old = h.service.market()
    h.fixture.service.publishCase('新的测试梁案')
    await h.service.refreshBootstrap()
    expect(h.service.getWireState().businessDate).toBe(h.initial.market!.business_date)
    expect(h.service.getWireState().activeCase.id).not.toBe(h.initial.market!.case_id)
    const rejected = expect(old).rejects.toMatchObject({ code: 'authority_changed' })
    finish(h.initial)
    await rejected
    expect(h.service.cachedMarketState()).toBeNull()
  })

  it('does not probe an unsupported old market on every fallback cadence', async () => {
    const h = await recoveryHarness()
    const read = vi.fn().mockRejectedValue(new BackendClientError('old server', 404, 'market_unavailable'))
    h.client.market = read
    await expect(h.service.market()).rejects.toThrow('old server')
    for (let i = 0; i < 20; i++) { h.fixture.clock.advance(5_000); h.service.tick(); await h.service.refreshSnapshot() }
    expect(read).toHaveBeenCalledTimes(1)
    // A deliberate browser reopen may check whether the server was upgraded.
    await expect(h.service.market()).rejects.toThrow('old server')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not revive a disposed Host from a late market read or later ticks', async () => {
    const h = await recoveryHarness()
    let finish!: (state: MarketState) => void
    h.client.market = async () => new Promise<MarketState>(resolve => { finish = resolve })
    const late = h.service.market()
    h.service.dispose()
    const rejected = expect(late).rejects.toThrow()
    finish(h.initial)
    await rejected
    h.fixture.clock.advance(60_000)
    h.service.tick()
    expect(h.service.cachedMarketState()).toBeNull()
  })
})
