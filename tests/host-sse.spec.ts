import { createServer, get, type ClientRequest, type IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { createLiangxiangApi } from '../src/host/routes.ts'
import type { LiangHostService } from '../src/host/service.ts'
import { parseWireState, type LiangxiangWireState } from '../src/shared/wire.ts'

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
})

async function startSseHarness() {
  const service = new FakeAuthoritativeLiangService({
    timezone: 'Asia/Shanghai', tokenPerIncense: 50_000,
    snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '今日梁案',
  }, { now: () => Date.UTC(2026, 9, 19, 4) }, () => undefined)
  service.markReadyMemoryOnly('sse-test')
  let state = service.getWireState()
  const listeners = new Set<() => void>()
  const routed: LiangHostService = Object.assign(service, {
    getWireState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
  // Exercise real sockets without waiting 25 seconds for the unchanged-state
  // barrier. The production heartbeat period is asserted below.
  const heartbeatCallbacks = new Set<() => void>()
  const actualInterval = globalThis.setInterval
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
    if (delay === 25_000) heartbeatCallbacks.add(callback)
    return actualInterval(callback, delay)
  }) as typeof setInterval)
  const api = createLiangxiangApi(routed, () => undefined, { selectAuthorityMode: () => undefined })
  const server = createServer((req, res) => { void api.handler(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('SSE harness did not bind')
  cleanups.push(async () => {
    api.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  return {
    url: `http://127.0.0.1:${address.port}/liangxiang/api/events`,
    get state() { return state },
    get subscriptions() { return listeners.size },
    close: () => api.closeAllConnections(),
    heartbeat: () => { for (const callback of heartbeatCallbacks) callback() },
    update(next: Partial<LiangxiangWireState> = {}) {
      state = { ...state, revision: state.revision + 1, ...next }
      for (const listener of listeners) listener()
    },
  }
}

async function openSse(url: string) {
  const frames: LiangxiangWireState[] = []
  let pings = 0
  let buffer = ''
  let request: ClientRequest
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    request = get(url, resolve)
    request.on('error', reject)
  })
  let ended = false
  response.on('end', () => { ended = true })
  response.setEncoding('utf8')
  response.on('data', (chunk: string) => {
    buffer += chunk
    let end: number
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      if (event === ': ping') pings += 1
      const data = event.split('\n').find(line => line.startsWith('data: '))
      if (data !== undefined) frames.push(parseWireState(JSON.parse(data.slice(6))))
    }
  })
  const close = () => { request.destroy(); response.destroy() }
  cleanups.push(close)
  await expect.poll(() => frames.length).toBe(1)
  return { frames, close, get pings() { return pings }, get ended() { return ended } }
}

describe('changed-state SSE delivery', () => {
  it('sends one initial frame per tab, suppresses 60 identical reads, and keeps heartbeat and reconnect', async () => {
    const host = await startSseHarness()
    const first = await openSse(host.url)
    const second = await openSse(host.url)
    expect(host.subscriptions).toBe(2)
    for (let read = 0; read < 60; read += 1) host.update()
    host.heartbeat()
    await expect.poll(() => [first.pings, second.pings]).toEqual([1, 1])
    expect(first.frames).toHaveLength(1)
    expect(second.frames).toHaveLength(1)
    first.close()
    await expect.poll(() => host.subscriptions).toBe(1)
    const reconnected = await openSse(host.url)
    expect(reconnected.frames[0]?.revision).toBe(host.state.revision)
    expect(reconnected.frames[0]?.personal).toEqual(host.state.personal)
    host.close()
    await expect.poll(() => second.ended && reconnected.ended).toBe(true)
    expect(host.subscriptions).toBe(0)
  })

  it('immediately delivers personal/global changes, notices and expiry, settings, authority failures and epochs', async () => {
    const host = await startSseHarness()
    const tab = await openSse(host.url)
    const updates: Array<Partial<LiangxiangWireState>> = [
      { streamingActive: true },
      { streamingActive: false },
      { personal: { ...host.state.personal, effectiveTokensToday: 50_000, remainingIncense: 1 } },
      { personal: { ...host.state.personal, effectiveTokensToday: 50_001, remainingIncense: 1 } },
      { accounting: { ...host.state.accounting, inputTokensToday: 1, observedAt: 1 } },
      { global: { ...host.state.global, upVotes: 1, uniqueVoters: 1, sequence: 2, lifetimeIncense: 1, lifetimeVoters: 1 } },
      { broadcast: { id: 'notice-test', level: 'important', message: '社区通知', startsAt: 1, expiresAt: 2, updatedAt: 1 } },
      { broadcast: null },
      { dayEnd: { enabled: true, voteType: 'down', available: true } },
      { archiveVersion: 1 },
      { snapshotRefreshSeconds: 5 },
      { authorityAvailable: false, authorityReason: '连接暂不可用' },
      { authorityAvailable: true, authorityReason: null },
      { authorityMode: 'DEV_STAGING_ONLY' },
      { hostEpoch: host.state.hostEpoch + 1, revision: 0 },
    ]
    for (const update of updates) host.update(update)
    host.heartbeat()
    await expect.poll(() => tab.pings).toBe(1)
    expect(tab.frames).toHaveLength(1 + updates.length)
    for (let index = 0; index < updates.length; index += 1) {
      expect(tab.frames[index + 1]).toMatchObject(updates[index] as Partial<LiangxiangWireState>)
    }
  })
})
