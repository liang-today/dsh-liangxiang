import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerResponse } from 'node:http'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { generateCommunityKeypair, signRequest, type CommunityKeypair } from '../src/host/community-keys.ts'
import { DEVICE_HEADER, INSTALLATION_HEADER, PUBLIC_KEY_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, WALLET_CAPABILITY_HEADER, WALLET_CAPABILITY_VERSION } from '../src/shared/backend-v1.ts'
import { parseMarketState, parseMarketStreamEvent, type MarketStreamEvent } from '../src/shared/market-v1.ts'
import { createBackendFixture } from './helpers/backend.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); vi.useRealTimers(); vi.restoreAllMocks() })
const START = Date.UTC(2026, 7, 16, 1)
async function setup(signed = false) {
  const fixture = createBackendFixture({}, START)
  const api = createBackendHttpApi({ service: fixture.service, store: fixture.store,
    voteRateLimitPerMinute: 0, allowUnsigned: !signed, log: () => undefined })
  await new Promise<void>(resolve => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  if (address === null || typeof address === 'string') throw new Error('no HTTP listener')
  const base = `http://127.0.0.1:${address.port}`
  cleanups.push(async () => {
    await new Promise<void>(resolve => api.server.close(() => resolve()))
    api.reset()
    fixture.close()
  })
  const enroll = (fingerprint: string, incense = 0): CommunityKeypair => {
    const key = generateCommunityKeypair(fingerprint)
    fixture.store.upsertIdentity({ installation_id: key.installationId, public_key: key.publicKey,
      device_fingerprint: fingerprint, created_at: START, last_seen_at: START })
    fixture.grantIncense(key.installationId, incense)
    return key
  }
  return { ...fixture, api, base, enroll }
}
function headers(id: string | CommunityKeypair, method = 'GET', path = '/v1/market', body = ''): Record<string, string> {
  if (typeof id === 'string') return { [INSTALLATION_HEADER]: id, [WALLET_CAPABILITY_HEADER]: WALLET_CAPABILITY_VERSION, 'content-type': 'application/json' }
  const timestamp = Date.now()
  return { [WALLET_CAPABILITY_HEADER]: WALLET_CAPABILITY_VERSION, [INSTALLATION_HEADER]: id.installationId, [PUBLIC_KEY_HEADER]: id.publicKey,
    [TIMESTAMP_HEADER]: String(timestamp), [DEVICE_HEADER]: id.deviceFingerprint ?? '',
    [SIGNATURE_HEADER]: signRequest({ privateKeyPem: id.privateKeyPem, method, path,
      timestamp, body, installationId: id.installationId }), 'content-type': 'application/json' }
}
async function firstEvent(base: string, identity: string | CommunityKeypair): Promise<{ event: MarketStreamEvent, cancel: () => void }> {
  const controller = new AbortController()
  const response = await fetch(`${base}/v1/events`, { headers: headers(identity, 'GET', '/v1/events'), signal: controller.signal })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const reader = response.body!.getReader()
  let buffer = ''
  for (let i = 0; i < 20; i += 1) {
    const { value, done } = await reader.read()
    if (done) throw new Error('stream ended before first state')
    buffer += new TextDecoder().decode(value)
    const payload = buffer.split('\n').find(line => line.startsWith('data: '))
    if (payload !== undefined && buffer.includes('\n\n')) {
      return { event: parseMarketStreamEvent(JSON.parse(payload.slice(6))), cancel: () => { controller.abort(); void reader.cancel().catch(() => undefined) } }
    }
  }
  throw new Error('stream did not send a bounded initial state')
}

describe('market HTTP authority and cloud stream', () => {
  it('refreshes a same-case initial frame after a business-clock cutoff within one wall second', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const h = await setup()
    for (const id of ['cutoff-owner-a', 'cutoff-owner-b']) h.grantIncense(id, 100)
    const market = h.service.marketState('cutoff-owner-a').market!
    for (const [index, id] of ['cutoff-owner-a', 'cutoff-owner-b'].entries()) {
      h.service.setMarketPosition(id, { market_id: market.id, batch: 1,
        side: index === 0 ? 'long' : 'short', amount: 10, request_id: `cutoff-${index}` })
    }
    const before = await firstEvent(h.base, 'cutoff-owner-a')
    h.clock.advance(2 * 60 * 60 * 1000)
    h.service.tick()
    const after = await firstEvent(h.base, 'cutoff-owner-b')
    expect(after.event.server_time).toBe(h.clock.now())
    expect(after.event.market_state?.server_time).toBe(after.event.server_time)
    expect(after.event.market_state?.market?.batches[0]?.status).toBe('locked')
    before.cancel(); after.cancel()
  })

  it('destroys a persistently blocked socket after the bounded recovery window', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const h = await setup()
    let response: ServerResponse | undefined
    h.api.server.prependListener('request', (req, res) => {
      if (req.url !== '/v1/events') return
      response = res
      const write = res.write.bind(res)
      res.write = ((text: string) => { write(text); return false }) as typeof res.write
    })
    const subscription = await firstEvent(h.base, 'blocked-stream-owner')
    await vi.advanceTimersByTimeAsync(24_000)
    expect(response?.destroyed).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(response?.destroyed).toBe(true)
    subscription.cancel()
  })

  it('keeps a backpressured connection alive and sends the latest private state after drain', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const h = await setup()
    const writes: string[] = []
    let response: ServerResponse | undefined
    h.api.server.prependListener('request', (req, res) => {
      if (req.url !== '/v1/events') return
      response = res
      const write = res.write.bind(res)
      res.write = ((text: string) => {
        writes.push(text)
        const result = write(text)
        return writes.length === 1 ? false : result
      }) as typeof res.write
    })
    h.grantIncense('slow-stream-owner', 10)
    const subscription = await firstEvent(h.base, 'slow-stream-owner')
    expect(response?.writableEnded).toBe(false)
    h.grantIncense('slow-stream-owner', 1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(writes).toHaveLength(1)
    response!.emit('drain')
    await vi.advanceTimersByTimeAsync(1000)
    expect(writes).toHaveLength(2)
    const payload = writes[1]!.split('\n').find(l => l.startsWith('data: '))!
    expect(parseMarketStreamEvent(JSON.parse(payload.slice(6))).market_state?.wallet.available_incense).toBe(11)
    subscription.cancel()
  })

  it('initializes only a new subscriber instead of rebroadcasting across existing streams', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const h = await setup()
    const buildFrame = vi.spyOn(h.service, 'prepareMarketStreamFrame')
    const subscriptions = []
    for (let n = 0; n < 24; n += 1) subscriptions.push(await firstEvent(h.base, `stream-load-${n}`))
    // All subscribers get a full state and independent revision. Opening 24
    // streams must not perform 24 whole-population public reads/fanouts.
    expect(buildFrame).toHaveBeenCalledTimes(1)
    expect(subscriptions.every(s => s.event.revision === 1 && s.event.snapshot !== undefined)).toBe(true)
    for (const subscription of subscriptions) subscription.cancel()
  })

  it('requires signatures, protects query parameters, and rejects client-supplied balances', async () => {
    const h = await setup(true)
    const key = h.enroll('http-market-device-a', 10)
    expect((await fetch(`${h.base}/v1/market`, { headers: headers(key.installationId) })).status).toBe(401)
    const stateReply = await fetch(`${h.base}/v1/market`, { headers: headers(key) })
    const state = parseMarketState(await stateReply.json())
    const query = '/v1/market/history?limit=1'
    const valid = await fetch(`${h.base}${query}`, { headers: headers(key, 'GET', query) })
    expect(valid.status).toBe(200)
    const tampered = await fetch(`${h.base}/v1/market/history?limit=2`, { headers: headers(key, 'GET', query) })
    expect(tampered.status).toBe(401)
    const body = JSON.stringify({ market_id: state.market!.id, batch: 1, side: 'long', amount: 1,
      request_id: 'bad-balance-intent', available_incense: 999999 })
    expect((await fetch(`${h.base}/v1/market/position`, { method: 'POST', body,
      headers: headers(key, 'POST', '/v1/market/position', body) })).status).toBe(400)
    expect(h.service.marketState(key.installationId).wallet.available_incense).toBe(20) // gift + claim
  })

  it('freezes or spends the same last incense once under parallel HTTP requests', async () => {
    const h = await setup()
    const id = 'parallel-market-wallet'
    h.grantIncense(id, 1)
    const state = h.service.marketState(id)
    const replies = await Promise.all(Array.from({ length: 40 }, (_, n) => {
      const path = n % 2 === 0 ? '/v1/votes' : '/v1/market/position'
      const body = n % 2 === 0
        ? { case_id: state.market!.case_id, vote_type: 'up', request_id: `race-vote-${n}` }
        : { market_id: state.market!.id, batch: 1, side: 'long', amount: 1, request_id: `race-position-${n}` }
      return fetch(`${h.base}${path}`, { method: 'POST', headers: headers(id), body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() as Record<string, unknown> }))
    }))
    expect(replies.every(r => r.status < 500)).toBe(true)
    const wallet = h.service.marketState(id).wallet
    const spent = h.store.incenseFor(id, '2026-08-16')!.used_incense
    expect(wallet.available_incense + wallet.frozen_incense + spent).toBe(1)
    expect(spent).toBeLessThanOrEqual(1)
    expect(wallet.frozen_incense).toBeLessThanOrEqual(1)
    expect(h.store.database.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' })
  })

  it('sends only the authenticated wallet and shuts streams down with the server', async () => {
    const h = await setup(true)
    const a = h.enroll('private-stream-device-a', 5)
    const b = h.enroll('private-stream-device-b', 20)
    h.service.tick()
    const streamA = await firstEvent(h.base, a)
    const streamB = await firstEvent(h.base, b)
    expect(streamA.event.market_state!.wallet.available_incense).toBe(15)
    expect(streamB.event.market_state!.wallet.available_incense).toBe(30)
    expect(JSON.stringify(streamA.event)).not.toContain(b.installationId)
    expect(JSON.stringify(streamA.event)).not.toContain(b.privateKeyPem)
    expect(streamA.event.snapshot).toBeDefined()
    expect(streamA.event.candle_interval_ms).toBe(60_000)
    expect(streamA.event.market_state?.candle_interval_ms).toBe(60_000)
    expect(streamA.event.epoch).toBe(streamB.event.epoch)
    streamA.cancel(); streamB.cancel()
  })

  it('bounds query pages and does not mix different case histories', async () => {
    const h = await setup()
    const id = 'bounded-market-reader'
    for (const path of ['/v1/market/candles?limit=289', '/v1/market/history?limit=51',
      '/v1/market/history?limit=1&limit=2', '/v1/market/candles?cursor=bad',
      '/v1/market/candles?interval_ms=1000', '/v1/market/candles?interval_ms=6e4']) {
      expect((await fetch(`${h.base}${path}`, { headers: headers(id) })).status).toBe(400)
    }
    const candles = await fetch(`${h.base}/v1/market/candles`, { headers: headers(id) })
    expect(candles.status).toBe(200)
    const payload = await candles.json() as { candles: unknown[], interval_ms: number }
    expect(payload.candles.length).toBeLessThanOrEqual(288)
    expect(payload.interval_ms).toBe(60_000)
    const legacy = await fetch(`${h.base}/v1/market/candles?interval_ms=300000`, { headers: headers(id) })
    expect((await legacy.json() as { interval_ms: number }).interval_ms).toBe(300_000)
  })
})
