import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAuthoritativeLiangService, type LiangServiceConfig } from '../src/host/fake-service.ts'
import { BackendClientError } from '../src/host/backend-client.ts'
import { createLiangxiangApi } from '../src/host/routes.ts'
import type { LiangHostService } from '../src/host/service.ts'
import { AUTHORITY_MODE_ACTION_HEADER, AUTHORITY_MODE_ACTION_VALUE } from '../src/shared/index.ts'
import { DAY_END_ACTION_HEADER, DAY_END_ACTION_VALUE, type DayEndPreferences } from '../src/shared/day-end.ts'
import type { HostAuthorityPreference } from '../src/shared/wire.ts'
import { MAIN_PANEL_ART } from '../src/client/main-panel-art.ts'

const CONFIG: LiangServiceConfig = {
  timezone: 'Asia/Shanghai',
  tokenPerIncense: 50_000,
  snapshotRefreshSeconds: 1,
  seed: 'empty',
  caseTitle: 'DeepSeek Harness 是夯还是拉',
}

let closeHarness: (() => Promise<void>) | null = null

async function start(options: { rateLimitedVote?: boolean, modeChanging?: boolean, ready?: boolean, dayEnd?: (preferences: DayEndPreferences) => Promise<void> } = {}): Promise<{ baseUrl: string, selected: () => HostAuthorityPreference[] }> {
  const service = new FakeAuthoritativeLiangService(CONFIG, { now: () => Date.UTC(2026, 7, 18, 4) }, () => undefined)
  if (options.ready !== false) service.markReadyMemoryOnly('route-test')
  const routedService = service as LiangHostService
  if (options.rateLimitedVote === true) {
    routedService.vote = async () => {
      throw new BackendClientError('backend vote limited', 429, 'vote_rate_limited')
    }
  }
  const selected: HostAuthorityPreference[] = []
  const api = createLiangxiangApi(routedService, () => undefined, {
    ...(options.dayEnd === undefined ? {} : { setDayEndPreferences: options.dayEnd }),
    selectAuthorityMode: (preference) => { selected.push(preference) },
    isAuthorityModeChanging: () => options.modeChanging === true,
  })
  const server = createServer((req, res) => {
    void api.handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('route test server did not bind')
  closeHarness = async () => {
    api.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  return { baseUrl: `http://127.0.0.1:${address.port}`, selected: () => [...selected] }
}

afterEach(async () => {
  await closeHarness?.()
  closeHarness = null
})

describe('Host authority-mode action boundary', () => {
  it('rejects an unguarded cross-site-compatible POST', async () => {
    const harness = await start()
    const response = await fetch(`${harness.baseUrl}/liangxiang/api/mode`, { method: 'POST' })
    expect(response.status).toBe(403)
    expect(harness.selected()).toEqual([])
  })

  it('accepts the explicit JSON action issued by the Liangxiang client', async () => {
    const harness = await start()
    const response = await fetch(`${harness.baseUrl}/liangxiang/api/mode`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AUTHORITY_MODE_ACTION_HEADER]: AUTHORITY_MODE_ACTION_VALUE,
      },
      body: '{"mode":"local"}',
    })
    expect(response.status).toBe(200)
    expect(harness.selected()).toEqual(['local'])
  })

  it('allows the explicit mode action to finish host startup', async () => {
    const harness = await start({ ready: false })
    const response = await fetch(`${harness.baseUrl}/liangxiang/api/mode`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AUTHORITY_MODE_ACTION_HEADER]: AUTHORITY_MODE_ACTION_VALUE,
      },
      body: '{"mode":"local"}',
    })
    expect(response.status).toBe(200)
    expect(harness.selected()).toEqual(['local'])
  })

  it('locks gameplay mutations while an authority handoff is in progress', async () => {
    const harness = await start({ modeChanging: true })
    const response = await fetch(`${harness.baseUrl}/liangxiang/api/local/cycle-case`, { method: 'POST' })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('mode is changing') })
  })
})

describe('Host vote error mapping', () => {
  it('preserves a backend 429 instead of reporting a false 502 outage', async () => {
    const harness = await start({ rateLimitedVote: true })
    const state = await fetch(`${harness.baseUrl}/liangxiang/api/state`).then(response => response.json()) as {
      activeCase: { id: string }
    }
    const response = await fetch(`${harness.baseUrl}/liangxiang/api/vote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        caseId: state.activeCase.id,
        voteType: 'up',
        requestId: 'req-rate-limited-01',
      }),
    })
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: { code: 'vote_rate_limited' } })
  })
})


describe('day-end preferences boundary', () => {
  it('requires an explicit JSON action and rejects balance, identity and unsupported directions', async () => {
    const saved: DayEndPreferences[] = []
    const harness = await start({ dayEnd: async p => { saved.push(p) } })
    const post = (body: string, guarded = true) => fetch(`${harness.baseUrl}/liangxiang/api/day-end`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(guarded ? { [DAY_END_ACTION_HEADER]: DAY_END_ACTION_VALUE } : {}) }, body,
    })
    expect((await post('{"enabled":true,"voteType":"up"}', false)).status).toBe(403)
    expect((await post('{"enabled":true,"voteType":"neutral"}')).status).toBe(400)
    expect((await post('{"enabled":true,"voteType":"down","remaining":500}')).status).toBe(400)
    expect(saved).toEqual([])
    expect((await post('{"enabled":true,"voteType":"down"}')).status).toBe(200)
    expect(saved).toEqual([{ enabled: true, voteType: 'down' }])
  })
})

describe('read-only panel illustrations', () => {
  it('serves each approved asset before Host authority is ready, with cache and image headers', async () => {
    const harness = await start({ ready: false })
    for (const asset of ['nan', 'grass', 'fish'] as const) {
      const response = await fetch(harness.baseUrl + MAIN_PANEL_ART[asset])
      const expected = await readFile(new URL(`../src/client/assets/main-${asset}.webp`, import.meta.url))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/webp')
      expect(response.headers.get('content-length')).toBe(String(expected.byteLength))
      expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(Buffer.from(await response.arrayBuffer())).toEqual(expected)
    }
  })

  it('rejects missing, duplicate, unknown and path-like query values', async () => {
    const harness = await start({ ready: false })
    for (const query of [
      '', '?asset=other', '?asset=../main-nan', '?asset=%2Fetc%2Fpasswd',
      '?asset=nan&asset=fish', '?asset=grass&path=main-nan.webp',
      '?asset=fish&v=1&v=2', '?asset=nan&v=', '?asset=nan&v=' + 'x'.repeat(65),
    ]) {
      const response = await fetch(harness.baseUrl + '/liangxiang/api/panel/art.webp' + query)
      expect(response.status, query).toBe(400)
      expect(await response.json()).toMatchObject({ error: 'invalid panel illustration request', error_detail: { code: 'invalid_request' } })
    }
  })

  it('is GET-only and repeated concurrent reads never mutate the personal or global state', async () => {
    const harness = await start()
    const stateUrl = harness.baseUrl + '/liangxiang/api/state'
    const before = await fetch(stateUrl).then(response => response.json())
    const denied = await fetch(harness.baseUrl + MAIN_PANEL_ART.nan, { method: 'POST' })
    expect(denied.status).toBe(405)
    const images = await Promise.all(Array.from({ length: 8 }, () => fetch(harness.baseUrl + MAIN_PANEL_ART.fish)
      .then(response => response.arrayBuffer()).then(bytes => Buffer.from(bytes))))
    expect(images.every(image => image.equals(images[0]!))).toBe(true)
    expect(await fetch(stateUrl).then(response => response.json())).toEqual(before)
    expect(harness.selected()).toEqual([])
  })
})
