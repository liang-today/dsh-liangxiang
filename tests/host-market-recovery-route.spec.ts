import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { BackendLiangService } from '../src/host/backend-service.ts'
import { createBackendClient, type BackendClient } from '../src/host/backend-client.ts'
import { startBackendEventStream, type BackendStreamStatus } from '../src/host/backend-event-stream.ts'
import { createLiangxiangApi } from '../src/host/routes.ts'
import { createMarketSession, type MarketTransport } from '../src/client/market/market-client.ts'
import { marketLatestChartPoint } from '../src/client/market/candle-view.ts'
import type { MarketState } from '../src/shared/market-v1.ts'
import { createBackendFixture } from './helpers/backend.ts'

const OBSERVER = 'market-recovery-observer', OTHER = 'market-recovery-voter'
const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('test listener unavailable')
  return `http://127.0.0.1:${address.port}`
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}

/** Real SQLite and both HTTP boundaries; only the unavailable cloud stream is controlled. */
async function setup() {
  const fixture = createBackendFixture({}, Date.UTC(2026, 7, 16, 4, 30))
  cleanups.push(() => fixture.close())
  fixture.grantIncense(OBSERVER, 0)
  fixture.grantIncense(OTHER, 40)
  const caseId = fixture.service.ensureActiveCase().id
  for (const vote_type of ['up', 'down'] as const) {
    expect(fixture.service.vote(OTHER, { case_id: caseId, vote_type, count: 10, request_id: `seed-${vote_type}` }).result.status).toBe('accepted')
  }
  const backendApi = createBackendHttpApi({ service: fixture.service, store: fixture.store,
    allowUnsigned: true, voteRateLimitPerMinute: 0, log: () => undefined })
  const backendUrl = await listen(backendApi.server)
  cleanups.push(async () => { backendApi.reset(); await closeServer(backendApi.server) })
  const requests: Array<{ method: string, path: string }> = []
  const client = createBackendClient({ baseUrl: backendUrl, fetchImpl: (async (url, init) => {
    requests.push({ method: init?.method ?? 'GET', path: new URL(String(url)).pathname })
    return fetch(url, init)
  }) as typeof fetch })
  let cloud: Parameters<NonNullable<BackendClient['subscribeEvents']>>[1] | undefined
  client.subscribeEvents = (_id, options) => { cloud = options; return () => undefined }
  const host = new BackendLiangService({ client, timezone: 'Asia/Shanghai', clock: fixture.clock,
    claimDebounceMs: 0, warn: () => undefined })
  cleanups.push(() => host.dispose())
  host.attachIdentity(OBSERVER)
  await host.refreshBootstrap()
  const hostApi = createLiangxiangApi(host, () => undefined, { selectAuthorityMode: () => undefined })
  const hostServer = createServer((req, res) => { void hostApi.handler(req, res) })
  const hostUrl = `${await listen(hostServer)}/liangxiang/api/market`
  cleanups.push(async () => { hostApi.closeAllConnections(); await closeServer(hostServer) })
  const controllers = new Set<AbortController>()
  let localFrames = 0, stopEvents: (() => void) | undefined
  const transport: MarketTransport = {
    async request(path, intent) {
      if (intent !== undefined) throw new Error('the observer must not place an order')
      const controller = new AbortController()
      controllers.add(controller)
      try {
        const response = await fetch(`${hostUrl}${path}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`local route returned ${response.status}`)
        return { body: await response.json() as unknown, scope: response.headers.get('x-liangxiang-cache-scope') ?? '' }
      } finally { controllers.delete(controller) }
    },
    events(onState, onError) {
      stopEvents = startBackendEventStream({ url: `${hostUrl}/events`, headers: () => ({}),
        onMessage: data => {
          const body = JSON.parse(data) as MarketState & { cache_scope: string }
          localFrames++
          onState(body, body.cache_scope)
        },
        onStatus: status => { if (status === 'disconnected' || status === 'unsupported') onError() },
      })
      return { close: () => stopEvents?.() }
    },
    requestId() { throw new Error('the observer must not submit a transaction') },
    dispose() { stopEvents?.(); for (const controller of controllers) controller.abort(); controllers.clear() },
  }
  const session = createMarketSession(transport, null)
  cleanups.push(() => session.dispose())
  await session.start()
  // Fence both initial HTTP reads and the first local SSE frame. A still-running
  // cold history request must not accidentally make an unchanged implementation pass.
  await vi.waitFor(() => {
    expect(localFrames).toBeGreaterThan(0)
    expect(session.getSnapshot().candles.at(-1)?.volume).toBe(20)
  })
  if (cloud === undefined) throw new Error('Host cloud subscription was not initialized')
  return { fixture, host, session, requests, cloud, caseId }
}

describe('market recovery through the Host route and existing client session', () => {
  it.each(['disconnected', 'unsupported'] as const)('refreshes another voter\'s candle through a %s cloud stream without observer activity', async status => {
    const { fixture, host, session, requests, cloud, caseId } = await setup()
    cloud.onStatus(status satisfies BackendStreamStatus)
    const wallet = { ...session.getSnapshot().state!.wallet }
    const before = session.getSnapshot().candles.at(-1)!
    fixture.clock.advance(60_000)
    fixture.service.tick()
    expect(fixture.service.vote(OTHER, { case_id: caseId, vote_type: 'down', count: 4, request_id: 'other-vote-during-recovery' }).result.status).toBe('accepted')
    const reference = fixture.service.marketState(OBSERVER)
    const requestOffset = requests.length
    for (let i = 0; i < 20; i++) {
      fixture.clock.advance(1_000)
      host.tick()
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    await vi.waitFor(() => {
      const view = session.getSnapshot(), candle = view.candles.at(-1)
      expect(candle?.at).toBeGreaterThan(before.at)
      expect(candle?.volume).toBe(4)
      expect(candle?.close).toBe(10 / 24)
      expect(candle?.up_votes).toBe(10)
      expect(candle?.down_votes).toBe(14)
      expect(view.state?.current_point).toMatchObject({ up_votes: 10, down_votes: 14 })
      expect(view.state?.wallet).toEqual(wallet)
      expect(view.pending).toBeNull()
      expect(view.sending).toBe(false)
      const plotted = marketLatestChartPoint(view.candles, view.state!.server_time, view.candleIntervalMs, view.state!.current_point)
      expect(plotted?.ratio).toBe(10 / 24)
      expect(plotted?.source).toBe('candle')
    })
    expect(session.getSnapshot().state?.current_candle).toEqual(reference.current_candle)
    const fallback = requests.slice(requestOffset)
    expect(fallback.some(request => request.path === '/v1/market')).toBe(true)
    expect(fallback.filter(request => request.path === '/v1/market').length).toBeLessThanOrEqual(4)
    expect(fallback.some(request => request.path === '/v1/market/history')).toBe(false)
    expect(fallback.every(request => request.method === 'GET')).toBe(true)
  })

  it('uses public cloud frames without extra market or snapshot polling while the stream is healthy', async () => {
    const { fixture, host, session, requests, cloud, caseId } = await setup()
    const wallet = { ...session.getSnapshot().state!.wallet }
    cloud.onStatus('connected')
    cloud.onEvent({ schema_version: 1, epoch: 'healthy-test-cloud', revision: 1,
      server_time: fixture.clock.now(), market_state: fixture.service.marketState(OBSERVER) })
    fixture.clock.advance(60_000)
    fixture.service.tick()
    fixture.service.vote(OTHER, { case_id: caseId, vote_type: 'down', count: 4, request_id: 'other-vote-healthy-stream' })
    const snapshot = fixture.service.snapshotResponse(), candle = fixture.service.marketCurrentCandle()!
    const requestOffset = requests.length
    cloud.onEvent({ schema_version: 1, epoch: 'healthy-test-cloud', revision: 2,
      server_time: fixture.clock.now(), snapshot, candle, candle_interval_ms: 60_000 })
    for (let i = 0; i < 20; i++) {
      fixture.clock.advance(1_000)
      host.tick()
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    await vi.waitFor(() => {
      expect(session.getSnapshot().candles.at(-1)).toEqual(candle)
      expect(session.getSnapshot().state?.wallet).toEqual(wallet)
      expect(session.getSnapshot().state?.current_point).toMatchObject({ up_votes: 10, down_votes: 14 })
    })
    expect(requests.slice(requestOffset).filter(request => request.path === '/v1/market' || request.path === '/v1/snapshot')).toEqual([])
    expect(session.getSnapshot().pending).toBeNull()
  })
})
