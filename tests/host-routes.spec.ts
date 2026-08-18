import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAuthoritativeLiangService, type LiangServiceConfig } from '../src/host/fake-service.ts'
import { BackendClientError } from '../src/host/backend-client.ts'
import { createLiangxiangApi } from '../src/host/routes.ts'
import type { LiangHostService } from '../src/host/service.ts'
import { LOCAL_MODE_ACTION_HEADER, LOCAL_MODE_ACTION_VALUE } from '../src/shared/index.ts'

const CONFIG: LiangServiceConfig = {
  timezone: 'Asia/Shanghai',
  tokenPerIncense: 50_000,
  snapshotRefreshSeconds: 1,
  seed: 'empty',
  caseTitle: 'DeepSeek Harness 是夯还是拉',
}

let closeHarness: (() => Promise<void>) | null = null

async function start(options: { rateLimitedVote?: boolean } = {}): Promise<{ baseUrl: string, entered: () => number }> {
  const service = new FakeAuthoritativeLiangService(CONFIG, { now: () => Date.UTC(2026, 7, 18, 4) }, () => undefined)
  service.markReadyMemoryOnly('route-test')
  const routedService = service as LiangHostService
  if (options.rateLimitedVote === true) {
    routedService.vote = async () => {
      throw new BackendClientError('backend vote limited', 429, 'vote_rate_limited')
    }
  }
  let entered = 0
  const api = createLiangxiangApi(routedService, () => undefined, { chooseLocalMode: () => { entered += 1 } })
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
  return { baseUrl: `http://127.0.0.1:${address.port}`, entered: () => entered }
}

afterEach(async () => {
  await closeHarness?.()
  closeHarness = null
})

describe('Host local-mode action boundary', () => {
  it('rejects an unguarded cross-site-compatible POST', async () => {
    const harness = await start()
    const response = await fetch(`${harness.baseUrl}/liangxiang/api/local/enter`, { method: 'POST' })
    expect(response.status).toBe(403)
    expect(harness.entered()).toBe(0)
  })

  it('accepts the explicit JSON action issued by the Liangxiang client', async () => {
    const harness = await start()
    const response = await fetch(`${harness.baseUrl}/liangxiang/api/local/enter`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [LOCAL_MODE_ACTION_HEADER]: LOCAL_MODE_ACTION_VALUE,
      },
      body: '{}',
    })
    expect(response.status).toBe(200)
    expect(harness.entered()).toBe(1)
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
