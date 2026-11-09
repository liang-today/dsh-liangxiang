import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserTransport, createLiveLiangxiangStore } from '../src/client/live-store.ts'
import { browserMarketTransport, createMarketSession } from '../src/client/market/market-client.ts'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import type { MarketState } from '../src/shared/market-v1.ts'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../src/shared/request-budget.ts'

const cleanups: Array<() => void> = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const close of cleanups.splice(0)) close()
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals()
})

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => { clearTimeout(timer); reject(new DOMException('signal is aborted without reason', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

const transports = [
  { name: 'main panel', create: () => {
    const transport = createBrowserTransport()
    return { read: () => transport.fetchJson('/liangxiang/api/history'), close: () => transport.dispose?.() }
  } },
  { name: 'market', create: () => {
    const transport = browserMarketTransport()
    return { read: () => transport.request('/candles'), close: () => transport.dispose() }
  } },
]

describe.each(transports)('$name browser deadline', ({ create }) => {
  it('allows a Host-sized retry and slow body instead of aborting at six seconds', async () => {
    const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
      await wait(6_300, init!.signal!)
      return { ok: true, status: 200, headers: new Headers(), json: async () => {
        await wait(5_000, init!.signal!)
        return { retained: true }
      } } as Response
    })
    vi.stubGlobal('fetch', fetcher)
    const client = create(); cleanups.push(client.close)
    let result: unknown = 'pending'
    const pending = client.read().then(value => { result = value }, error => { result = error })
    await vi.advanceTimersByTimeAsync(6_001)
    expect(result).toBe('pending')
    await vi.advanceTimersByTimeAsync(5_299)
    await pending
    expect(result).not.toBeInstanceOf(Error)
    expect(result).not.toBe('pending')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('bounds a stalled body with a Chinese timeout message', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => ({
      ok: true, status: 200, headers: new Headers(),
      json: async () => { await wait(BROWSER_REQUEST_TIMEOUT_MS + 1_000, init!.signal!); return {} },
    } as Response)))
    const client = create(); cleanups.push(client.close)
    const result = client.read().catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS)
    const error = await result as Error
    expect(error.message).toMatch(/网络|响应/)
    expect(error.message).not.toMatch(/AbortError|aborted|signal/i)
  })

  it('cancels an outstanding request on dispose without leaking a native abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      await wait(BROWSER_REQUEST_TIMEOUT_MS + 1_000, init!.signal!)
      return new Response('{}')
    }))
    const client = create()
    const result = client.read().catch((error: unknown) => error)
    client.close()
    const error = await result as Error
    expect(error.message).toContain('关闭')
    expect(error.message).not.toMatch(/AbortError|aborted|signal/i)
    expect(vi.getTimerCount()).toBe(0)
  })
})

class Source {
  static CLOSED = 2
  static instances: Source[] = []
  readyState = 1
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  constructor(_url: string) { Source.instances.push(this) }
  close(): void { this.readyState = Source.CLOSED }
}

const marketState: MarketState = { schema_version: 1, server_time: 1_800_000_000_000, soft_trust: true,
  wallet: { available_incense: 50, frozen_incense: 0, total_incense: 50, token_remainder: 0, token_per_incense: 50_000, version: 1 },
  market: null, current_point: null }

it('automatically recovers a timed-out market read and never exposes AbortError or submits a mutation', async () => {
  Source.instances = []; vi.stubGlobal('EventSource', Source)
  const requests: Array<{ path: string, method: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    requests.push({ path: input, method: init?.method ?? 'GET' })
    if (requests.length === 1) await wait(BROWSER_REQUEST_TIMEOUT_MS + 1_000, init!.signal!)
    return new Response(JSON.stringify(input === '/liangxiang/api/market' ? marketState
      : { schema_version: 1, receipts: [], next_cursor: null }))
  }))
  const session = createMarketSession(browserMarketTransport(), null); cleanups.push(() => session.dispose())
  const opening = session.start()
  await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS)
  await opening
  expect(session.getSnapshot().status).toBe('offline')
  expect(session.getSnapshot().error).toMatch(/自动重连/)
  expect(session.getSnapshot().error).not.toMatch(/AbortError|aborted|signal/i)
  await vi.advanceTimersByTimeAsync(1_000)
  expect(session.getSnapshot().status).toBe('live')
  expect(session.getSnapshot().error).toBeNull()
  expect(requests.filter(r => r.path === '/liangxiang/api/market')).toHaveLength(2)
  expect(requests.every(r => r.method === 'GET')).toBe(true)
})

it('rebuilds a permanently CLOSED main-panel stream after its single native error', async () => {
  Source.instances = []; vi.stubGlobal('EventSource', Source)
  const service = new FakeAuthoritativeLiangService({ timezone: 'UTC', tokenPerIncense: 50_000,
    snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '连接回归' }, { now: () => Date.UTC(2026, 10, 9, 12) }, () => undefined)
  service.markReadyMemoryOnly('request-budget')
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    requests.push(input)
    return new Response(JSON.stringify(input === '/liangxiang/api/state' ? service.getWireState() : service.history()))
  }))
  const store = createLiveLiangxiangStore(); cleanups.push(() => store.dispose())
  store.start(); await vi.advanceTimersByTimeAsync(0)
  expect(store.getSnapshot().connection).toBe('live')
  Source.instances[0]!.readyState = Source.CLOSED
  Source.instances[0]!.onerror?.(new Event('error'))
  expect(store.getSnapshot().connection).toBe('offline')
  await vi.advanceTimersByTimeAsync(1_000)
  expect(store.getSnapshot().connection).toBe('live')
  expect(Source.instances).toHaveLength(2)
  expect(requests.filter(path => path === '/liangxiang/api/state')).toHaveLength(2)
})

it('backs off repeated CLOSED streams until a valid frame restores the initial delay', async () => {
  Source.instances = []; vi.stubGlobal('EventSource', Source)
  const service = new FakeAuthoritativeLiangService({ timezone: 'UTC', tokenPerIncense: 50_000,
    snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '连接回归' }, { now: () => Date.UTC(2026, 10, 9, 12) }, () => undefined)
  service.markReadyMemoryOnly('request-budget')
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    requests.push(input)
    return new Response(JSON.stringify(input === '/liangxiang/api/state' ? service.getWireState() : service.history()))
  }))
  const store = createLiveLiangxiangStore(); cleanups.push(() => store.dispose())
  const fail = (): void => {
    const source = Source.instances.at(-1)!
    source.readyState = Source.CLOSED
    source.onerror?.(new Event('error'))
  }
  store.start(); await vi.advanceTimersByTimeAsync(0)
  for (const delay of [1_000, 2_000, 4_000]) {
    const count = Source.instances.length
    fail()
    expect(store.getSnapshot().connection).toBe('offline')
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(Source.instances).toHaveLength(count)
    await vi.advanceTimersByTimeAsync(1)
    expect(Source.instances).toHaveLength(count + 1)
  }
  Source.instances.at(-1)!.onmessage?.({ data: JSON.stringify(service.getWireState()) } as MessageEvent)
  fail()
  await vi.advanceTimersByTimeAsync(999)
  expect(Source.instances).toHaveLength(4)
  await vi.advanceTimersByTimeAsync(1)
  expect(Source.instances).toHaveLength(5)
  expect(requests.filter(path => path === '/liangxiang/api/state')).toHaveLength(5)
  const healthyReads = requests.length
  await vi.advanceTimersByTimeAsync(30_000)
  expect(requests).toHaveLength(healthyReads)
})
