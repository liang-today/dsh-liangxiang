import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackendClient } from '../src/host/backend-client.ts'
import type { MarketPositionRequest, MarketState } from '../src/shared/market-v1.ts'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../src/shared/request-budget.ts'

const STATE: MarketState = {
  schema_version: 1, server_time: 1_794_211_200_000, soft_trust: true,
  wallet: { available_incense: 35, frozen_incense: 5, total_incense: 40,
    token_remainder: 2_000, token_per_incense: 50_000, version: 2 },
  market: null, current_point: null,
}
const INTENT: MarketPositionRequest = {
  market_id: 'market-budget-test', batch: 2, side: 'short', amount: 7,
  request_id: 'request-budget-existing-intent',
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('Host and browser request budgets', () => {
  it('finishes the complete retried read before the browser deadline, including a slow response body', async () => {
    const started: number[] = []
    const client = createBackendClient({ baseUrl: 'http://127.0.0.1:4180', fetchImpl: async (_input, init) => {
      started.push(Date.now())
      const signal = init!.signal!
      if (started.length === 1) return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        const abort = (): void => controller.error(new DOMException('aborted', 'AbortError'))
        signal.addEventListener('abort', abort, { once: true })
        setTimeout(() => {
          signal.removeEventListener('abort', abort)
          controller.enqueue(new TextEncoder().encode(JSON.stringify(STATE)))
          controller.close()
        }, 5_000)
      } })
      return new Response(body, { headers: { 'content-type': 'application/json' } })
    } })
    let deadline: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const read = Promise.race([
      client.market!('inst-request-budget'),
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('browser read deadline exceeded')), BROWSER_REQUEST_TIMEOUT_MS)
      }),
    ]).finally(() => { settled = true; clearTimeout(deadline) })
    try {
      await vi.advanceTimersByTimeAsync(6_000)
      expect(started).toEqual([0])
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(299)
      expect(started).toEqual([0])
      await vi.advanceTimersByTimeAsync(1)
      expect(started).toEqual([0, 6_300])
      await vi.advanceTimersByTimeAsync(4_999)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await expect(read).resolves.toEqual(STATE)
      expect(started).toHaveLength(2)
    } finally { clearTimeout(deadline); client.dispose() }
  })

  it('does not retry a deterministic upgrade-required response', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'wallet_upgrade_required', message: 'upgrade required' },
    }), { status: 412 }))
    const client = createBackendClient({ baseUrl: 'http://127.0.0.1:4180', fetchImpl })
    try {
      await expect(client.market!('inst-request-budget')).rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally { client.dispose() }
  })

  it('leaves a timed-out position intent uncertain without automatically submitting it again', async () => {
    const sent: unknown[] = []
    const client = createBackendClient({ baseUrl: 'http://127.0.0.1:4180', fetchImpl: async (_input, init) => {
      expect(init?.method).toBe('POST')
      sent.push(JSON.parse(String(init?.body)))
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    } })
    try {
      const rejected = expect(client.marketPosition!('inst-request-budget', INTENT)).rejects.toMatchObject({ status: null })
      await vi.advanceTimersByTimeAsync(6_000)
      await rejected
      await vi.advanceTimersByTimeAsync(30_000)
      expect(sent).toEqual([INTENT])
    } finally { client.dispose() }
  })
})
