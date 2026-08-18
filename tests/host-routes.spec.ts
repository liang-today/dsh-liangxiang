import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAuthoritativeLiangService, type LiangServiceConfig } from '../src/host/fake-service.ts'
import { BackendClientError } from '../src/host/backend-client.ts'
import { createLiangxiangApi } from '../src/host/routes.ts'
import type { LiangHostService } from '../src/host/service.ts'
import { AUTHORITY_MODE_ACTION_HEADER, AUTHORITY_MODE_ACTION_VALUE } from '../src/shared/index.ts'
import type { HostAuthorityPreference } from '../src/shared/wire.ts'

const CONFIG: LiangServiceConfig = {
  timezone: 'Asia/Shanghai',
  tokenPerIncense: 50_000,
  snapshotRefreshSeconds: 1,
  seed: 'empty',
  caseTitle: 'DeepSeek Harness 是夯还是拉',
}

let closeHarness: (() => Promise<void>) | null = null

async function start(options: { rateLimitedVote?: boolean, modeChanging?: boolean, ready?: boolean } = {}): Promise<{ baseUrl: string, selected: () => HostAuthorityPreference[] }> {
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
