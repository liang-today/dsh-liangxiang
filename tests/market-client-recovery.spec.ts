import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserMarketTransport, createMarketSession, type MarketResponse, type MarketTransport } from '../src/client/market/market-client.ts'
import type { MarketState } from '../src/shared/market-v1.ts'
import type { MarketStorage } from '../src/client/market/market-cache.ts'

const state = (version = 1): MarketState => ({ schema_version: 1, soft_trust: true,
  server_time: 1_800_000_000_000 + version, market: null, current_point: null,
  wallet: { available_incense: 50, frozen_incense: 0, total_incense: 50,
    token_remainder: 0, token_per_incense: 50_000, version } })
const cleanups: Array<() => void> = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => { for (const close of cleanups.splice(0)) close(); vi.useRealTimers(); vi.unstubAllGlobals() })

function harness() {
  const storage = new Map<string, string>()
  const memory: MarketStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value) }, removeItem: key => { storage.delete(key) } }
  const read = vi.fn(async (): Promise<MarketResponse> => ({ body: state(), scope: 'recovery-client' }))
  const streams: Array<{ frame(body: unknown, scope: string): void, fail(): void, close: ReturnType<typeof vi.fn> }> = []
  const request = vi.fn(async (path: string, intent?: unknown) => {
    if (intent !== undefined) throw new Error('lost order acknowledgment')
    return path === '' ? read() : { body: { schema_version: 1, receipts: [], next_cursor: null }, scope: 'recovery-client' }
  })
  const transport: MarketTransport = { request, requestId: () => 'recovery-client-request',
    events(frame, fail) { const close = vi.fn(); streams.push({ frame, fail, close }); return { close } }, dispose: vi.fn() }
  const session = createMarketSession(transport, memory)
  cleanups.push(() => session.dispose())
  return { session, read, request, streams, transport }
}

describe('browser market connection recovery', () => {
  it('retries the first state read without needing an existing EventSource or a manual click', async () => {
    const h = harness()
    h.read.mockRejectedValueOnce(new Error('temporary gateway failure'))
    await h.session.start()
    expect(h.session.getSnapshot().status).toBe('offline')
    expect(h.streams).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(999)
    expect(h.read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.read).toHaveBeenCalledTimes(2)
    expect(h.session.getSnapshot().status).toBe('live')
    expect(h.streams).toHaveLength(1)
    expect(h.request.mock.calls.every(([, body]) => body === undefined)).toBe(true)
  })

  it('recreates a CLOSED browser stream with bounded backoff and discards callbacks from the old source', async () => {
    const h = harness()
    await h.session.start()
    h.streams[0]!.fail() // This source never retries itself, just like CLOSED EventSource.
    expect(h.session.getSnapshot().status).toBe('offline')
    expect(h.streams[0]!.close).toHaveBeenCalledTimes(1)
    h.streams[0]!.frame(state(99), 'obsolete-identity')
    expect(h.session.getSnapshot().scope).toBe('recovery-client')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.streams).toHaveLength(2)
    h.streams[1]!.fail()
    await vi.advanceTimersByTimeAsync(1_999)
    expect(h.streams).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.streams).toHaveLength(3)
    h.streams[2]!.frame(state(2), 'recovery-client')
    h.streams[2]!.fail()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.streams).toHaveLength(4)
  })

  it('coalesces concurrent starts and cancels the scheduled retry when manually reconnected', async () => {
    const h = harness()
    let resolve!: (value: MarketResponse) => void
    h.read.mockImplementationOnce(() => new Promise<MarketResponse>(done => { resolve = done }))
    const first = h.session.start(), second = h.session.start()
    expect(h.read).toHaveBeenCalledTimes(1)
    resolve({ body: state(), scope: 'recovery-client' })
    await Promise.all([first, second])
    expect(h.streams).toHaveLength(1)
    h.streams[0]!.fail()
    await h.session.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.read).toHaveBeenCalledTimes(2)
    expect(h.streams).toHaveLength(2)
  })

  it('does not replay an uncertain position while reconnecting', async () => {
    const h = harness()
    await h.session.start()
    await h.session.submit({ market_id: 'recovery-market', batch: 1, side: 'long', amount: 5 })
    expect(h.session.getSnapshot().pending?.request_id).toBe('recovery-client-request')
    h.streams[0]!.fail()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.session.getSnapshot().pending?.request_id).toBe('recovery-client-request')
    expect(h.request.mock.calls.filter(([, body]) => body !== undefined)).toHaveLength(1)
  })

  it('recovers reads after a lost position acknowledgment without waiting for an SSE error or resubmitting', async () => {
    const h = harness()
    await h.session.start()
    await h.session.submit({ market_id: 'recovery-market', batch: 1, side: 'short', amount: 5 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.read).toHaveBeenCalledTimes(2)
    expect(h.session.getSnapshot().status).toBe('live')
    expect(h.session.getSnapshot().pending?.request_id).toBe('recovery-client-request')
    expect(h.request.mock.calls.filter(([, body]) => body !== undefined)).toHaveLength(1)
    await h.session.retryPending()
    expect(h.request.mock.calls.filter(([, body]) => body !== undefined).map(([, body]) => body)).toEqual([
      { market_id: 'recovery-market', batch: 1, side: 'short', amount: 5, request_id: 'recovery-client-request' },
      { market_id: 'recovery-market', batch: 1, side: 'short', amount: 5, request_id: 'recovery-client-request' },
    ])
  })

  it.each([404, 405, 501])('does not retry an unsupported Host response (%i)', async status => {
    const read = vi.fn(async () => new Response('', { status }))
    vi.stubGlobal('fetch', read)
    const session = createMarketSession(browserMarketTransport(), null)
    cleanups.push(() => session.dispose())
    await session.start()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(session.getSnapshot().status).toBe('unsupported')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('cancels retries on dispose and ignores an outstanding first read', async () => {
    const h = harness()
    h.read.mockRejectedValueOnce(new Error('temporary failure'))
    await h.session.start()
    h.session.dispose()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(h.read).toHaveBeenCalledTimes(1)
    const other = harness()
    let finish!: (value: MarketResponse) => void
    other.read.mockImplementationOnce(() => new Promise<MarketResponse>(resolve => { finish = resolve }))
    const pending = other.session.start()
    other.session.dispose()
    finish({ body: state(), scope: 'obsolete-identity' })
    await pending
    expect(other.session.getSnapshot().state).toBeNull()
    expect(other.streams).toHaveLength(0)
  })
})
