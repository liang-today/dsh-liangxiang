import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRequestId } from '../src/domain/vote.ts'
import { browserMarketTransport, createMarketSession, type MarketTransport } from '../src/client/market/market-client.ts'
import { readMarketCache, type MarketStorage } from '../src/client/market/market-cache.ts'
import { parseMarketPositionRequest } from '../src/shared/market-v1.ts'
import { createBackendFixture, type BackendFixture } from './helpers/backend.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
let fixture: BackendFixture | undefined
afterEach(() => { fixture?.close(); fixture = undefined; vi.unstubAllGlobals() })

describe('market request ids without crypto.randomUUID', () => {
  it.each(['missing', 'throwing', 'no Web Crypto'] as const)('uses the actual browser transport when %s', mode => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => webcrypto.getRandomValues(bytes))
    vi.stubGlobal('crypto', mode === 'no Web Crypto' ? undefined : {
      getRandomValues,
      ...(mode === 'throwing' ? { randomUUID: () => { throw new TypeError('randomUUID unavailable') } } : {}),
    })
    const transport = browserMarketTransport()
    try {
      const first = transport.requestId(), second = transport.requestId()
      expect(first).toMatch(UUID_V4)
      expect(second).toMatch(UUID_V4)
      expect(isRequestId(first)).toBe(true)
      expect(first).not.toBe(second)
      if (mode !== 'no Web Crypto') expect(getRandomValues).toHaveBeenCalledTimes(2)
    } finally { transport.dispose() }
  })

  it('persists a lost receipt and replays the identical body after reopening, without freezing twice', async () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => webcrypto.getRandomValues(bytes))
    vi.stubGlobal('crypto', { getRandomValues })
    const backend = fixture = createBackendFixture({}, Date.UTC(2026, 10, 8, 1))
    const installation = 'market-http-participant', scope = 'market-http-scope'
    backend.grantIncense(installation, 100)
    const before = backend.service.marketState(installation)
    const intent = { market_id: before.market!.id, batch: 1 as const, side: 'long' as const, amount: 10 }
    const values = new Map<string, string>(), bodies: string[] = []
    const storage: MarketStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
      removeItem: key => { values.delete(key) },
    }
    let loseFirstReceipt = true
    const open = () => {
      const browser = browserMarketTransport()
      const transport: MarketTransport = {
        ...browser,
        async request(path, body) {
          if (path.startsWith('/candles')) return { body: backend.service.marketCandles(), scope }
          if (path.startsWith('/history')) return { body: backend.service.marketHistory(installation), scope }
          if (path === '/position' && body) {
            const serialized = JSON.stringify(body)
            bodies.push(serialized)
            const result = backend.service.setMarketPosition(installation, parseMarketPositionRequest(JSON.parse(serialized)))
            if (loseFirstReceipt) { loseFirstReceipt = false; throw new Error('response lost after commit') }
            return { body: result, scope }
          }
          return { body: backend.service.marketState(installation), scope }
        },
        events: () => ({ close() {} }),
      }
      return createMarketSession(transport, storage)
    }
    const first = open()
    try {
      await first.start()
      await first.submit(intent)
      expect(first.getSnapshot()).toMatchObject({ status: 'offline', sending: false })
      expect(first.getSnapshot().pending?.request_id).toMatch(UUID_V4)
      expect(readMarketCache(storage, scope).pending).toEqual(first.getSnapshot().pending)
      expect(backend.service.marketState(installation).wallet).toMatchObject({
        available_incense: before.wallet.available_incense - 10, frozen_incense: 10,
      })
    } finally { first.dispose() }
    const reopened = open()
    try {
      await reopened.start()
      expect(reopened.getSnapshot().pending?.request_id).toBe(JSON.parse(bodies[0]!).request_id)
      const committedWallet = backend.service.marketState(installation).wallet
      await reopened.retryPending()
      expect(bodies).toHaveLength(2)
      expect(bodies[1]).toBe(bodies[0])
      expect(getRandomValues).toHaveBeenCalledTimes(1)
      expect(reopened.getSnapshot()).toMatchObject({ status: 'live', pending: null, sending: false, error: null })
      expect(readMarketCache(storage, scope).pending).toBeNull()
      expect(backend.service.marketState(installation).wallet).toEqual(committedWallet)
      await reopened.submit({ ...intent, side: 'short', amount: 15 })
      expect(bodies).toHaveLength(3)
      expect(JSON.parse(bodies[2]!).request_id).not.toBe(JSON.parse(bodies[0]!).request_id)
      expect(getRandomValues).toHaveBeenCalledTimes(2)
      expect(reopened.getSnapshot().state?.wallet).toMatchObject({
        available_incense: before.wallet.available_incense - 15, frozen_incense: 15,
      })
    } finally { reopened.dispose() }
  })
})
