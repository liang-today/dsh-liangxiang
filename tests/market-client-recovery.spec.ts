import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserMarketTransport, createMarketSession, type MarketResponse, type MarketTransport } from '../src/client/market/market-client.ts'
import type { MarketReceipt, MarketState } from '../src/shared/market-v1.ts'
import type { MarketStorage } from '../src/client/market/market-cache.ts'

const state = (version = 1): MarketState => ({ schema_version: 1, soft_trust: true,
  server_time: 1_800_000_000_000 + version, market: null, current_point: null,
  wallet: { available_incense: 50, frozen_incense: 0, total_incense: 50,
    token_remainder: 0, token_per_incense: 50_000, version } })
const receipt = (id: string): MarketReceipt => ({ id, market_id: id, business_date: '2026-11-06',
  settled_at: 1_800_000_000_000, invested_incense: 5, returned_incense: 5, pnl_incense: 0,
  close_point: null, batches: [{ batch: 1, side: 'long', amount: 5, payout: 5, result: 'draw', reference: null }] })
const page = (id?: string, next_cursor: string | null = null): MarketResponse => ({
  body: { schema_version: 1, receipts: id ? [receipt(id)] : [], next_cursor }, scope: 'recovery-client',
})
const cleanups: Array<() => void> = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => { for (const close of cleanups.splice(0)) close(); vi.useRealTimers(); vi.unstubAllGlobals() })

function harness() {
  const storage = new Map<string, string>()
  const memory: MarketStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value) }, removeItem: key => { storage.delete(key) } }
  const read = vi.fn(async (): Promise<MarketResponse> => ({ body: state(), scope: 'recovery-client' }))
  const history = vi.fn(async (): Promise<MarketResponse> => page())
  const streams: Array<{ frame(body: unknown, scope: string): void, fail(): void, close: ReturnType<typeof vi.fn> }> = []
  const request = vi.fn(async (path: string, intent?: unknown) => {
    if (intent !== undefined) throw new Error('lost order acknowledgment')
    return path === '' ? read() : history()
  })
  const transport: MarketTransport = { request, requestId: () => 'recovery-client-request',
    events(frame, fail) { const close = vi.fn(); streams.push({ frame, fail, close }); return { close } }, dispose: vi.fn() }
  const session = createMarketSession(transport, memory)
  cleanups.push(() => session.dispose())
  return { session, read, history, request, streams, transport }
}

describe('browser market connection recovery', () => {
  it('recovers history separately after five seconds without muting live trading or adding healthy reads', async () => {
    const h = harness()
    h.history.mockRejectedValueOnce(new Error('history unavailable'))
    await h.session.start()
    expect(h.session.getSnapshot()).toMatchObject({ status: 'live', error: null,
      historyError: '历史回执暂未更新，已确认的钱包不受影响。', historyLoading: false })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(h.history).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.history).toHaveBeenCalledTimes(2)
    expect(h.session.getSnapshot()).toMatchObject({ error: null, historyError: null })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.history).toHaveBeenCalledTimes(2)
    expect(h.read).toHaveBeenCalledTimes(1)
    expect(h.request.mock.calls.every(([, body]) => body === undefined)).toBe(true)
  })

  it.each(['failure', 'success'] as const)('replaces an in-flight history read after reconnect and ignores its late %s', async kind => {
    const h = harness()
    let resolve!: (value: MarketResponse) => void, reject!: (reason: Error) => void
    h.history.mockImplementationOnce(() => new Promise<MarketResponse>((done, fail) => { resolve = done; reject = fail }))
    const starting = h.session.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(h.history).toHaveBeenCalledTimes(1)
    let finishNew!: (value: MarketResponse) => void
    h.history.mockImplementationOnce(() => new Promise<MarketResponse>(done => { finishNew = done }))
    h.streams[0]!.fail()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.history).toHaveBeenCalledTimes(2)
    if (kind === 'failure') reject(new Error('obsolete history failure'))
    else resolve(page('obsolete'))
    await starting
    expect(h.session.getSnapshot()).toMatchObject({ status: 'live', error: null, historyError: null, historyLoading: true })
    expect(h.session.getSnapshot().receipts).toEqual([])
    finishNew(page('recovered'))
    await vi.advanceTimersByTimeAsync(0)
    expect(h.session.getSnapshot()).toMatchObject({ status: 'live', error: null, historyError: null, historyLoading: false })
    expect(h.session.getSnapshot().receipts).toEqual([receipt('recovered')])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(h.history).toHaveBeenCalledTimes(2)
  })

  it('does not let history failure or recovery overwrite an uncertain position notice or resend it', async () => {
    const h = harness()
    await h.session.start()
    await h.session.submit({ market_id: 'recovery-market', batch: 1, side: 'long', amount: 5 })
    h.history.mockRejectedValue(new Error('history unavailable'))
    await vi.advanceTimersByTimeAsync(1_000)
    const pending = h.session.getSnapshot().pending
    const notice = h.session.getSnapshot().error
    expect(notice).toContain('未确认')
    expect(h.session.getSnapshot().historyError).not.toBeNull()
    h.history.mockResolvedValue(page('confirmed-history'))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(h.session.getSnapshot()).toMatchObject({ error: notice, pending, historyError: null })
    expect(h.request.mock.calls.filter(([, body]) => body !== undefined)).toHaveLength(1)
  })

  it('clears only the recovered history notice while keeping a rejected transaction notice', async () => {
    const h = harness(), request = h.transport.request
    h.history.mockRejectedValueOnce(new Error('history unavailable'))
    await h.session.start()
    h.transport.request = async (path, intent) => intent ? { scope: 'recovery-client', body: {
      accepted: false, reason: 'insufficient balance', request_id: intent.request_id, state: state(),
    } } : request(path)
    await h.session.submit({ market_id: 'recovery-market', batch: 1, side: 'short', amount: 5 })
    const rejected = h.session.getSnapshot().error
    expect(rejected).toContain('可用香火不足')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(h.session.getSnapshot()).toMatchObject({ error: rejected, historyError: null, pending: null })
  })

  it('retries the failed history cursor and cancels it when another page is selected or the session closes', async () => {
    const h = harness()
    h.history.mockResolvedValueOnce(page('newest', 'older'))
    await h.session.start()
    h.history.mockRejectedValueOnce(new Error('older page unavailable')).mockResolvedValueOnce(page('older-page', 'oldest'))
    await h.session.loadHistory(true)
    expect(h.session.getSnapshot()).toMatchObject({ historyPage: 1, nextCursor: 'older' })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(h.request.mock.calls.filter(([path]) => path.startsWith('/history')).map(([path]) => path))
      .toEqual(['/history?limit=20', '/history?limit=20&cursor=older', '/history?limit=20&cursor=older'])
    expect(h.session.getSnapshot()).toMatchObject({ historyPage: 2, nextCursor: 'oldest', historyError: null })
    h.history.mockRejectedValueOnce(new Error('newest page unavailable'))
    await h.session.loadHistory()
    h.history.mockResolvedValue(page('manual-newest'))
    await h.session.loadHistory()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(h.history).toHaveBeenCalledTimes(5)
    h.history.mockRejectedValueOnce(new Error('last failure'))
    await h.session.loadHistory()
    h.session.dispose()
    const count = h.history.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.history).toHaveBeenCalledTimes(count)
    expect(h.request.mock.calls.every(([, body]) => body === undefined)).toBe(true)
  })

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

  it.each([0, -60_000])('restores the connection with an unchanged wallet and a %ims clock offset without rewinding data', async offset => {
    const h = harness()
    await h.session.start()
    const confirmed = { ...state(), server_time: state().server_time + 60_000 }
    h.streams[0]!.frame(confirmed, 'recovery-client')
    const retained = h.session.getSnapshot().state
    h.streams[0]!.fail()
    h.read.mockResolvedValue({ body: { ...confirmed, server_time: confirmed.server_time + offset }, scope: 'recovery-client' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.session.getSnapshot()).toMatchObject({ status: 'live', error: null })
    expect(h.session.getSnapshot().state).toEqual(retained)
    h.streams[1]!.frame({ ...confirmed, server_time: confirmed.server_time - 60_000 }, 'recovery-client')
    expect(h.session.getSnapshot()).toMatchObject({ status: 'live', error: null })
    expect(h.session.getSnapshot().state).toEqual(retained)
    expect(h.request.mock.calls.every(([, body]) => body === undefined)).toBe(true)
  })

  it('recovers transport without rolling back a newer wallet or clearing an uncertain intent', async () => {
    const h = harness()
    await h.session.start()
    const confirmed = state(4)
    h.streams[0]!.frame(confirmed, 'recovery-client')
    await h.session.submit({ market_id: 'recovery-market', batch: 1, side: 'short', amount: 5 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.session.getSnapshot().status).toBe('live')
    expect(h.session.getSnapshot().state).toEqual(confirmed)
    expect(h.session.getSnapshot().pending?.request_id).toBe('recovery-client-request')
    expect(h.session.getSnapshot().error).toContain('未确认')
    h.streams[1]!.frame(state(), 'recovery-client')
    expect(h.session.getSnapshot().status).toBe('live')
    expect(h.session.getSnapshot().state).toEqual(confirmed)
    expect(h.session.getSnapshot().pending?.request_id).toBe('recovery-client-request')
    expect(h.request.mock.calls.filter(([, body]) => body !== undefined)).toHaveLength(1)
  })

  it.each(['http', 'sse'] as const)('keeps a failed recovery offline after an invalid %s reply or an old-generation frame', async channel => {
    const h = harness()
    await h.session.start()
    h.streams[0]!.fail()
    if (channel === 'http') h.read.mockResolvedValue({ body: { invalid: true }, scope: 'recovery-client' })
    await vi.advanceTimersByTimeAsync(1_000)
    const source = h.streams.at(-1)!
    if (channel === 'sse') source.frame({ invalid: true }, 'recovery-client')
    source.frame(state(99), 'obsolete-identity')
    expect(h.session.getSnapshot()).toMatchObject({ status: 'offline', scope: 'recovery-client' })
    expect(h.session.getSnapshot().error).not.toBeNull()
    expect(h.streams).toHaveLength(channel === 'http' ? 1 : 2)
    expect(h.request.mock.calls.every(([, body]) => body === undefined)).toBe(true)
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
