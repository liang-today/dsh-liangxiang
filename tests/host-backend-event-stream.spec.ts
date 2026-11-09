import { afterEach, describe, expect, it, vi } from 'vitest'
import { startBackendEventStream, type BackendStreamStatus } from '../src/host/backend-event-stream.ts'
afterEach(() => vi.useRealTimers())

async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error('stream condition did not complete')
}

function streamFetch(chunks: string[], onOpen?: (signal: AbortSignal | null | undefined) => void): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    onOpen?.(init?.signal)
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      },
    })
    init?.signal?.addEventListener('abort', () => {
      try { streamController.close() } catch { /* already closed */ }
    }, { once: true })
    return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
  }) as typeof fetch
}

describe('Host cloud SSE transport', () => {
  it('can reconnect even when an aborted transport never resolves reader cancellation', async () => {
    let calls = 0
    const statuses: BackendStreamStatus[] = []
    const stop = startBackendEventStream({ url: 'http://127.0.0.1/v1/events', headers: () => ({}),
      retryMinMs: 2, retryMaxMs: 4, maxEventBytes: 32,
      fetchImpl: (async () => {
        calls += 1
        if (calls > 1) return new Response('', { status: 404 })
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${'x'.repeat(100)}\n\n`)) },
          cancel: () => new Promise<void>(() => undefined),
        }), { headers: { 'content-type': 'text/event-stream' } })
      }) as typeof fetch, onMessage: () => undefined, onStatus: status => statuses.push(status) })
    try { await until(() => statuses.includes('unsupported')); expect(calls).toBe(2) }
    finally { stop() }
  })

  it('retains exponential jittered backoff when headers and a state frame immediately flap', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    const stop = startBackendEventStream({ url: 'http://127.0.0.1/v1/events', headers: () => ({}),
      retryMinMs: 1000, retryMaxMs: 8000, random: () => 0,
      fetchImpl: (async () => {
        calls.push(Date.now())
        return new Response('data: {}\n\n', { headers: { 'content-type': 'text/event-stream' } })
      }) as typeof fetch, onMessage: () => undefined, onStatus: () => undefined })
    await vi.advanceTimersByTimeAsync(0)
    const start = calls[0]!
    await vi.advanceTimersByTimeAsync(3499)
    expect(calls.map(t => t - start)).toEqual([0, 500, 1500])
    await vi.advanceTimersByTimeAsync(1)
    expect(calls.map(t => t - start)).toEqual([0, 500, 1500, 3500])
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toHaveLength(4)
  })

  it('parses chunk boundaries, CRLF, heartbeat and multiline data; dispose aborts the only connection', async () => {
    const messages: Array<{ data: string, event: string }> = []
    const statuses: BackendStreamStatus[] = []
    let signal: AbortSignal | null | undefined
    let connections = 0
    const stop = startBackendEventStream({
      url: 'http://127.0.0.1/v1/events', headers: () => ({ 'x-test-auth': 'signed' }),
      fetchImpl: streamFetch([': ping\r', '\nevent: state\r\ndata: {"one":\r\n', 'data: 1}\r\n\r\n'], active => { signal = active; connections += 1 }),
      onStatus: status => statuses.push(status), onMessage: (data, event) => messages.push({ data, event }),
    })
    await until(() => messages.length === 1)
    expect(messages).toEqual([{ data: '{"one":\n1}', event: 'state' }])
    expect(statuses).toEqual(['connecting', 'connected'])
    stop()
    stop()
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(signal?.aborted).toBe(true)
    expect(connections).toBe(1)
  })

  it('marks an old backend unsupported without reconnecting', async () => {
    let calls = 0
    const statuses: BackendStreamStatus[] = []
    const stop = startBackendEventStream({
      url: 'http://127.0.0.1/v1/events', headers: () => ({}), retryMinMs: 1, retryMaxMs: 2,
      fetchImpl: (async () => { calls += 1; return new Response('{}', { status: 404 }) }) as typeof fetch,
      onStatus: status => statuses.push(status), onMessage: () => { throw new Error('unexpected message') },
    })
    await until(() => statuses.includes('unsupported'))
    await new Promise(resolve => setTimeout(resolve, 10))
    stop()
    expect(calls).toBe(1)
    expect(statuses).toEqual(['connecting', 'unsupported'])
  })

  it('rejects an oversized frame and creates fresh signed headers on bounded reconnect', async () => {
    const errors: Error[] = []
    const statuses: BackendStreamStatus[] = []
    let signatures = 0
    let calls = 0
    const headers: string[] = []
    const first = streamFetch([`data: ${'x'.repeat(100)}\n\n`])
    const stop = startBackendEventStream({
      url: 'http://127.0.0.1/v1/events', maxEventBytes: 32, retryMinMs: 2, retryMaxMs: 4,
      headers: () => ({ 'x-test-auth': String(++signatures) }),
      fetchImpl: (async (url, init) => {
        calls += 1
        headers.push(new Headers(init?.headers).get('x-test-auth') ?? '')
        return calls === 1 ? first(url, init) : new Response('', { status: 404 })
      }) as typeof fetch,
      onStatus: status => statuses.push(status), onMessage: () => { throw new Error('oversized message delivered') },
      onError: error => errors.push(error),
    })
    await until(() => statuses.includes('unsupported'))
    stop()
    expect(errors[0]?.message).toContain('too large')
    expect(headers).toEqual(['1', '2'])
    expect(statuses).toContain('disconnected')
  })
})
