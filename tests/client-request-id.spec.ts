/**
 * Regression for issue #26: a DSH Web UI opened over plain HTTP from another
 * machine is not a secure context, so `crypto.randomUUID` is missing. Vote
 * requests used to throw before leaving the browser and the vote lock stayed
 * stuck. The id only has to be unique per installation, never secret.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRequestId } from '../src/domain/index.ts'
import { randomRequestId, type RequestIdCrypto } from '../src/client/request-id.ts'
import { createBrowserTransport } from '../src/client/live-store.ts'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Deterministic fill so a fallback id is reproducible in a failure message. */
function fakeEntropy(seed = 0x9e3779b9): RequestIdCrypto {
  let state = seed >>> 0
  return {
    getRandomValues(array) {
      for (let index = 0; index < array.length; index += 1) {
        state ^= state << 13
        state >>>= 0
        state ^= state >>> 17
        state ^= state << 5
        state >>>= 0
        array[index] = state & 0xff
      }
      return array
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('vote request ids without a secure context', () => {
  it('keeps crypto.randomUUID when the page is a secure context', () => {
    const source: RequestIdCrypto = { randomUUID: () => '4f0f2c1a-9b5d-4e3a-8f6c-1d2e3f4a5b6c' }
    expect(randomRequestId(source)).toBe('4f0f2c1a-9b5d-4e3a-8f6c-1d2e3f4a5b6c')
  })

  it('falls back to getRandomValues when randomUUID is absent', () => {
    const id = randomRequestId(fakeEntropy())
    expect(isRequestId(id)).toBe(true)
    expect(id).toMatch(UUID_V4)
  })

  it('still returns a usable id when Web Crypto is missing entirely', () => {
    const id = randomRequestId(null)
    expect(isRequestId(id)).toBe(true)
    expect(id).toMatch(UUID_V4)
  })

  it('falls back when randomUUID throws or returns a malformed value', () => {
    const throwing: RequestIdCrypto = {
      randomUUID: () => {
        throw new Error('crypto.randomUUID is not a function')
      },
      ...fakeEntropy(),
    }
    expect(randomRequestId(throwing)).toMatch(UUID_V4)

    const malformed: RequestIdCrypto = { randomUUID: () => 'nope', ...fakeEntropy(7) }
    expect(randomRequestId(malformed)).toMatch(UUID_V4)
  })

  it('never repeats an id, even when the entropy source leaves zeros', () => {
    const broken: RequestIdCrypto = { getRandomValues: (array) => array }
    const ids = new Set(Array.from({ length: 200 }, () => randomRequestId(broken)))
    expect(ids.size).toBe(200)
  })

  it('does not repeat ids generated from real entropy', () => {
    const source = fakeEntropy(1)
    const ids = new Set(Array.from({ length: 2_000 }, () => randomRequestId(source)))
    expect(ids.size).toBe(2_000)
  })

  it('lets the browser transport mint a vote id without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: fakeEntropy().getRandomValues })
    const id = createBrowserTransport().randomRequestId()
    expect(isRequestId(id)).toBe(true)
    expect(id).toMatch(UUID_V4)
  })
})
