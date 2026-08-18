/**
 * `/v1` HTTP behaviour over a real listening server: concurrency (the
 * overspend guard), idempotency under parallel retries, multi-tab convergence,
 * boundary validation, and the A3 authority-mode guard.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { resolveBackendConfig, BackendConfigError } from '../src/backend/config.ts'
import { createBackendHttpApi, trustedClientAddress } from '../src/backend/http.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { openBackendStore } from '../src/backend/store.ts'
import {
  INSTALLATION_HEADER,
  parseV1Bootstrap,
  parseV1VoteResponse,
} from '../src/shared/backend-v1.ts'
import { parseV1HistoryResponse } from '../src/shared/index.ts'

const INSTALLATION = 'install-http-0001'

interface Harness {
  baseUrl: string
  service: LiangxiangBackendService
  get(path: string, installationId?: string): Promise<{ status: number, body: unknown }>
  post(path: string, body: unknown, installationId?: string): Promise<{ status: number, body: unknown }>
  close(): Promise<void>
}

let harness: Harness | null = null

async function start(options: {
  voteRateLimitPerMinute?: number
  voteRateLimitMaxKeys?: number
  tokenPerIncense?: number
  logs?: string[]
} = {}): Promise<Harness> {
  const config = resolveBackendConfig(
    {
      LIANGXIANG_BACKEND_DB: ':memory:',
      LIANGXIANG_BACKEND_PORT: '0',
      LIANGXIANG_SNAPSHOT_SECONDS: '300',
      LIANGXIANG_TOKEN_PER_INCENSE: String(options.tokenPerIncense ?? 50_000),
      LIANGXIANG_MAX_TOKENS_PER_MINUTE: '0',
    },
    () => undefined,
  )
  const store = openBackendStore(config.databasePath)
  const service = new LiangxiangBackendService({ store, config, warn: () => undefined })
  const api = createBackendHttpApi({
    service,
    store,
    voteRateLimitPerMinute: options.voteRateLimitPerMinute ?? 0,
    ...(options.voteRateLimitMaxKeys === undefined ? {} : { voteRateLimitMaxKeys: options.voteRateLimitMaxKeys }),
    allowUnsigned: true,
    log: options.logs === undefined ? () => undefined : (message) => options.logs?.push(message),
  })
  await new Promise<void>((resolve) => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  if (address === null || typeof address === 'string') throw new Error('server did not bind a port')
  const baseUrl = `http://127.0.0.1:${address.port}`

  const request = async (
    path: string,
    init: { method: string, body?: unknown, installationId?: string },
  ): Promise<{ status: number, body: unknown }> => {
    const headers: Record<string, string> = {}
    if (init.installationId !== undefined) headers[INSTALLATION_HEADER] = init.installationId
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    const request: RequestInit = { method: init.method, headers }
    if (init.body !== undefined) request.body = JSON.stringify(init.body)
    const response = await fetch(`${baseUrl}${path}`, request)
    return { status: response.status, body: (await response.json()) as unknown }
  }

  harness = {
    baseUrl,
    service,
    get: (path, installationId = INSTALLATION) => request(path, { method: 'GET', installationId }),
    post: (path, body, installationId = INSTALLATION) =>
      request(path, { method: 'POST', body, installationId }),
    close: async () => {
      await new Promise<void>((resolve) => api.server.close(() => resolve()))
      api.reset()
      store.close()
    },
  }
  return harness
}

async function grant(h: Harness, tokens: number, installationId = INSTALLATION): Promise<void> {
  const response = await h.post(
    '/v1/token-claims',
    { claimed_effective_tokens: tokens, claim_business_date: h.service.businessDate() },
    installationId,
  )
  expect(response.status).toBe(200)
}

async function activeCaseId(h: Harness, installationId = INSTALLATION): Promise<string> {
  const bootstrap = parseV1Bootstrap((await h.get('/v1/bootstrap', installationId)).body)
  return bootstrap.active_case.id
}

afterEach(async () => {
  await harness?.close()
  harness = null
})

describe('routing and boundary validation', () => {
  it('serves the public 梁祠 archive separately and validates its delta cursor', async () => {
    const h = await start()
    const response = await fetch(`${h.baseUrl}/v1/history`)
    expect(response.status).toBe(200)
    expect(parseV1HistoryResponse(await response.json())).toMatchObject({
      full: true,
      archiveVersion: 0,
      days: [],
      weeks: [],
      months: [],
    })
    const delta = await fetch(`${h.baseUrl}/v1/history?after_version=0`)
    expect(delta.status).toBe(200)
    expect(parseV1HistoryResponse(await delta.json()).full).toBe(false)
    const malformed = await fetch(`${h.baseUrl}/v1/history?after_version=-1`)
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({ error: { field: 'after_version' } })
  })

  it('serves health without an identity and reports the authority mode', async () => {
    const h = await start()
    const response = await fetch(`${h.baseUrl}/v1/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', authority_mode: 'DEV_STAGING_ONLY' })
  })

  it('rejects a missing or malformed installation header', async () => {
    const h = await start()
    const missing = await fetch(`${h.baseUrl}/v1/bootstrap`)
    expect(missing.status).toBe(401)
    const malformed = await h.get('/v1/bootstrap', 'short')
    expect(malformed.status).toBe(401)
    expect(malformed.body).toMatchObject({ error: { code: 'missing_installation' } })
  })

  it('answers unknown routes and wrong methods structurally', async () => {
    const h = await start()
    const unknown = await h.get('/v1/nope')
    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject({ error: { code: 'unknown_route' } })
    const wrongMethod = await h.post('/v1/bootstrap', {})
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.body).toMatchObject({ error: { code: 'method_not_allowed' } })
  })

  it('refuses a vote body that declares its own authority', async () => {
    const h = await start()
    await grant(h, 100_000)
    const caseId = await activeCaseId(h)
    const response = await h.post('/v1/votes', {
      case_id: caseId,
      vote_type: 'up',
      request_id: 'req-forged-0001',
      remaining_incense: 999,
    })
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ error: { code: 'invalid_request', field: 'vote.remaining_incense' } })
  })

  it('refuses a third vote option', async () => {
    const h = await start()
    await grant(h, 100_000)
    const caseId = await activeCaseId(h)
    const response = await h.post('/v1/votes', {
      case_id: caseId,
      vote_type: 'steady',
      request_id: 'req-third-00001',
    })
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ error: { field: 'vote.vote_type' } })
  })

  it('does not grow the rate-limit map with every installation id it sees', async () => {
    const h = await start({ voteRateLimitPerMinute: 5, voteRateLimitMaxKeys: 32 })
    const caseId = await activeCaseId(h)
    // Installation ids are self-minted, so unbounded per-id state would be
    // attacker-controlled memory growth.
    for (let i = 0; i < 1_200; i += 1) {
      await h.post(
        '/v1/votes',
        { case_id: caseId, vote_type: 'up', request_id: `req-flood-${String(i).padStart(6, '0')}` },
        `inst-flood-${String(i).padStart(6, '0')}`,
      )
    }
    // Nothing was spent (no claims), and the server is still responsive.
    const health = await fetch(`${h.baseUrl}/v1/health`)
    expect(health.status).toBe(200)
    // Once the active-key cap is full, an unseen id fails closed with 429.
    const overflow = await h.post(
      '/v1/votes',
      { case_id: caseId, vote_type: 'up', request_id: 'req-after-cap-0001' },
      'inst-after-cap-0001',
    )
    expect(overflow.status).toBe(429)
    expect(overflow.body).toMatchObject({ error: { message: expect.stringContaining('active-key capacity') } })
  })

  it('answers an oversized body with 413 instead of killing the connection', async () => {
    const h = await start()
    await grant(h, 100_000)
    const caseId = await activeCaseId(h)
    // A destroyed socket looks like a network fault, which is exactly the state
    // a vote client must not be left in — it cannot tell rejected from unknown.
    const response = await fetch(`${h.baseUrl}/v1/votes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [INSTALLATION_HEADER]: INSTALLATION },
      body: JSON.stringify({
        case_id: caseId,
        vote_type: 'up',
        request_id: 'req-oversized-01',
        pad: 'x'.repeat(8_000),
      }),
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_request' } })
    const state = parseV1Bootstrap((await h.get('/v1/bootstrap')).body).authoritative_personal_state
    expect(state.used_incense).toBe(0)
  })

  it('rate limits vote requests per installation', async () => {
    const h = await start({ voteRateLimitPerMinute: 2 })
    await grant(h, 500_000)
    const caseId = await activeCaseId(h)
    const statuses: number[] = []
    for (let i = 0; i < 4; i += 1) {
      const response = await h.post('/v1/votes', {
        case_id: caseId,
        vote_type: 'up',
        request_id: `req-rate-0000${i}`,
      })
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 2)).toEqual([200, 200])
    expect(statuses.slice(2)).toEqual([429, 429])
    const limited = await h.post('/v1/votes', {
      case_id: caseId,
      vote_type: 'up',
      request_id: 'req-rate-code-01',
    })
    expect(limited.body).toMatchObject({ error: { code: 'vote_rate_limited' } })
  })
})

describe('concurrency and idempotency over HTTP', () => {
  it('accepts at most one vote when 100 distinct requests race for one incense', async () => {
    const h = await start()
    await grant(h, 50_000)
    const caseId = await activeCaseId(h)
    const responses = await Promise.all(
      Array.from({ length: 100 }, (_unused, index) =>
        h.post('/v1/votes', {
          case_id: caseId,
          vote_type: index % 2 === 0 ? 'up' : 'down',
          request_id: `req-race-${String(index).padStart(6, '0')}`,
        })),
    )
    const accepted = responses.filter((response) => {
      const result = (response.body as { result?: { status?: string } }).result
      return result?.status === 'accepted'
    })
    expect(accepted).toHaveLength(1)
    expect(responses.filter((response) => response.status === 409)).toHaveLength(99)

    const state = parseV1Bootstrap((await h.get('/v1/bootstrap')).body).authoritative_personal_state
    expect(state.used_incense).toBe(1)
    expect(state.remaining_incense).toBe(0)
    expect(h.service.snapshotResponse().global_snapshot.case_id).toBe(caseId)
  })

  it('spends once when the same request id is retried in parallel', async () => {
    const h = await start()
    await grant(h, 150_000)
    const caseId = await activeCaseId(h)
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        h.post('/v1/votes', { case_id: caseId, vote_type: 'up', request_id: 'req-parallel-01' })),
    )
    for (const response of responses) {
      expect(response.status).toBe(200)
      const parsed = parseV1VoteResponse(response.body)
      expect(parsed.result.status).toBe('accepted')
    }
    const state = parseV1Bootstrap((await h.get('/v1/bootstrap')).body).authoritative_personal_state
    expect(state.used_incense).toBe(1)
    expect(state.remaining_incense).toBe(2)
  })

  it('reports a conflict for the same request id with a different direction', async () => {
    const h = await start()
    await grant(h, 150_000)
    const caseId = await activeCaseId(h)
    await h.post('/v1/votes', { case_id: caseId, vote_type: 'up', request_id: 'req-conflict-http' })
    const conflict = await h.post('/v1/votes', {
      case_id: caseId,
      vote_type: 'down',
      request_id: 'req-conflict-http',
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body).toMatchObject({ result: { reason: 'idempotency_conflict' } })
  })

  it('converges two tabs of one installation onto a single shared pool', async () => {
    const h = await start()
    await grant(h, 150_000)
    const caseId = await activeCaseId(h)
    // Same installation id = same authoritative ledger, whatever the tab count.
    const tabA = await h.post('/v1/votes', { case_id: caseId, vote_type: 'up', request_id: 'req-tab-a-0001' })
    const tabB = await h.post('/v1/votes', { case_id: caseId, vote_type: 'down', request_id: 'req-tab-b-0001' })
    const tabAagain = await h.post('/v1/votes', { case_id: caseId, vote_type: 'up', request_id: 'req-tab-a-0002' })
    const fourth = await h.post('/v1/votes', { case_id: caseId, vote_type: 'up', request_id: 'req-tab-b-0002' })

    expect(parseV1VoteResponse(tabA.body).authoritative_personal_state.remaining_incense).toBe(2)
    expect(parseV1VoteResponse(tabB.body).authoritative_personal_state.remaining_incense).toBe(1)
    expect(parseV1VoteResponse(tabAagain.body).authoritative_personal_state.remaining_incense).toBe(0)
    expect(fourth.status).toBe(409)
    expect(fourth.body).toMatchObject({ result: { reason: 'insufficient_incense' } })
  })

  it('races two tabs for the last incense: at most one wins', async () => {
    const h = await start()
    await grant(h, 50_000)
    const caseId = await activeCaseId(h)
    const [first, second] = await Promise.all([
      h.post('/v1/votes', { case_id: caseId, vote_type: 'up', request_id: 'req-race-tab-a1' }),
      h.post('/v1/votes', { case_id: caseId, vote_type: 'down', request_id: 'req-race-tab-b1' }),
    ])
    const accepted = [first, second].filter((response) => response.status === 200)
    expect(accepted).toHaveLength(1)
    const state = parseV1Bootstrap((await h.get('/v1/bootstrap')).body).authoritative_personal_state
    expect(state.used_incense).toBe(1)
    expect(state.remaining_incense).toBe(0)
  })

  it('keeps installations independent', async () => {
    const h = await start()
    await grant(h, 50_000, 'install-http-0002')
    const caseId = await activeCaseId(h, 'install-http-0002')
    const other = await h.post(
      '/v1/votes',
      { case_id: caseId, vote_type: 'up', request_id: 'req-other-00001' },
      'install-http-0002',
    )
    expect(other.status).toBe(200)
    // The first installation never received a claim, so it has nothing to spend.
    const denied = await h.post('/v1/votes', {
      case_id: caseId,
      vote_type: 'up',
      request_id: 'req-denied-0001',
    })
    expect(denied.status).toBe(409)
    expect(denied.body).toMatchObject({ result: { reason: 'insufficient_incense' } })
  })
})

describe('authority mode guard', () => {
  it('refuses to boot as VERIFIED_PRODUCTION under Decision Gate A3', () => {
    expect(() =>
      resolveBackendConfig({ LIANGXIANG_AUTHORITY_MODE: 'VERIFIED_PRODUCTION' }, () => undefined))
      .toThrow(BackendConfigError)
  })

  it('rejects an unknown authority mode', () => {
    expect(() => resolveBackendConfig({ LIANGXIANG_AUTHORITY_MODE: 'TRUSTED' }, () => undefined))
      .toThrow(BackendConfigError)
  })

  it('defaults to DEV_STAGING_ONLY', () => {
    const config = resolveBackendConfig({}, () => undefined)
    expect(config.authorityMode).toBe('DEV_STAGING_ONLY')
    expect(config.allowUnsigned).toBe(false)
  })

  it('refuses unsigned mode on a public listen address', () => {
    expect(() => resolveBackendConfig({
      LIANGXIANG_BACKEND_HOST: '0.0.0.0',
      LIANGXIANG_ALLOW_UNSIGNED: '1',
    }, () => undefined)).toThrow(BackendConfigError)
  })
})

describe('trusted proxy client address', () => {
  it('accepts one valid forwarded address only from the loopback proxy hop', () => {
    expect(trustedClientAddress('127.0.0.1', '86.26.145.181')).toBe('86.26.145.181')
    expect(trustedClientAddress('::ffff:127.0.0.1', '2001:db8::5')).toBe('2001:db8::5')
  })

  it('ignores forged, malformed, or chained forwarding from untrusted peers', () => {
    expect(trustedClientAddress('203.0.113.7', '1.1.1.1')).toBe('203.0.113.7')
    expect(trustedClientAddress('127.0.0.1', '1.1.1.1, 2.2.2.2')).toBe('127.0.0.1')
    expect(trustedClientAddress('127.0.0.1', 'not-an-ip')).toBe('127.0.0.1')
  })
})

describe('community Ed25519 auth', () => {
  it('rejects unsigned bootstrap when allowUnsigned is off', async () => {
    const config = resolveBackendConfig(
      {
        LIANGXIANG_BACKEND_DB: ':memory:',
        LIANGXIANG_BACKEND_PORT: '0',
        LIANGXIANG_SNAPSHOT_SECONDS: '300',
        LIANGXIANG_MAX_TOKENS_PER_MINUTE: '0',
      },
      () => undefined,
    )
    const store = openBackendStore(config.databasePath)
    const service = new LiangxiangBackendService({ store, config, warn: () => undefined })
    const api = createBackendHttpApi({
      service,
      store,
      voteRateLimitPerMinute: 0,
      allowUnsigned: false,
      log: () => undefined,
    })
    await new Promise<void>((resolve) => api.server.listen(0, '127.0.0.1', resolve))
    const address = api.server.address()
    if (address === null || typeof address === 'string') throw new Error('server did not bind a port')
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/bootstrap`, {
      headers: { [INSTALLATION_HEADER]: INSTALLATION },
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_signature' } })
    await new Promise<void>((resolve) => api.server.close(() => resolve()))
    api.reset()
    store.close()
  })

  it('admits a signed first install with a public ticket and binds its device once', async () => {
    const { generateCommunityKeypair, signRequest } = await import('../src/host/community-keys.ts')
    const {
      DEVICE_HEADER,
      PUBLIC_KEY_HEADER,
      SIGNATURE_HEADER,
      TIMESTAMP_HEADER,
    } = await import('../src/shared/backend-v1.ts')
    const config = resolveBackendConfig(
      {
        LIANGXIANG_BACKEND_DB: ':memory:',
        LIANGXIANG_BACKEND_PORT: '0',
        LIANGXIANG_SNAPSHOT_SECONDS: '300',
        LIANGXIANG_MAX_TOKENS_PER_MINUTE: '0',
      },
      () => undefined,
    )
    const store = openBackendStore(config.databasePath)
    const service = new LiangxiangBackendService({ store, config, warn: () => undefined })
    const api = createBackendHttpApi({
      service,
      store,
      voteRateLimitPerMinute: 0,
      allowUnsigned: false,
      log: () => undefined,
    })
    await new Promise<void>((resolve) => api.server.listen(0, '127.0.0.1', resolve))
    const address = api.server.address()
    if (address === null || typeof address === 'string') throw new Error('server did not bind a port')
    const baseUrl = `http://127.0.0.1:${address.port}`

    service.issueAdmissionTickets(2)
    const publicTickets = await fetch(`${baseUrl}/v1/admission/tickets`)
    expect(publicTickets.status).toBe(200)
    const ticketBody = await publicTickets.json() as {
      available_claims: number
      tickets: Array<{ secret: string }>
    }
    expect(ticketBody.available_claims).toBe(2)

    const signedRequest = async (
      identity: ReturnType<typeof generateCommunityKeypair>,
      path: string,
      method: 'GET' | 'POST',
      body: unknown,
    ): Promise<Response> => {
      const rawBody = method === 'POST' ? JSON.stringify(body) : ''
      const timestamp = Date.now()
      return fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          [INSTALLATION_HEADER]: identity.installationId,
          [PUBLIC_KEY_HEADER]: identity.publicKey,
          [TIMESTAMP_HEADER]: String(timestamp),
          [SIGNATURE_HEADER]: signRequest({
            privateKeyPem: identity.privateKeyPem,
            method,
            path,
            timestamp,
            body: rawBody,
            installationId: identity.installationId,
          }),
          [DEVICE_HEADER]: identity.deviceFingerprint as string,
          ...method === 'POST' ? { 'content-type': 'application/json' } : {},
        },
        ...method === 'POST' ? { body: rawBody } : {},
      })
    }

    const first = generateCommunityKeypair('device-fingerprint-alpha')
    const firstClaimBody = {
      ticket_secret: ticketBody.tickets[0]?.secret,
      public_key: first.publicKey,
      device_fingerprint: first.deviceFingerprint,
    }
    const admitted = await signedRequest(first, '/v1/admission/claim', 'POST', firstClaimBody)
    expect(admitted.status).toBe(200)
    expect(await admitted.json()).toMatchObject({ claimed: true, installation_id: first.installationId })
    expect((await signedRequest(first, '/v1/bootstrap', 'GET', null)).status).toBe(200)

    const second = generateCommunityKeypair('device-fingerprint-alpha')
    const secondClaimBody = {
      ticket_secret: ticketBody.tickets[1]?.secret,
      public_key: second.publicKey,
      device_fingerprint: second.deviceFingerprint,
    }
    const conflict = await signedRequest(second, '/v1/admission/claim', 'POST', secondClaimBody)
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({ error: { code: 'device_conflict' } })

    await new Promise<void>((resolve) => api.server.close(() => resolve()))
    api.reset()
    store.close()
  })

})

describe('quiet access log', () => {
  it('logs hello, new incense, and votes — not health or snapshot polls', async () => {
    const logs: string[] = []
    const h = await start({ logs })
    await fetch(`${h.baseUrl}/v1/health`)
    await fetch(`${h.baseUrl}/v1/snapshot`)
    await h.get('/v1/bootstrap')
    await grant(h, 150_000)
    const caseId = await activeCaseId(h)
    await h.post('/v1/votes', { case_id: caseId, vote_type: 'up', request_id: 'req-log-000001' })
    await fetch(`${h.baseUrl}/v1/snapshot`)

    const text = logs.join('\n')
    expect(text).toContain('hello install=install-http')
    expect(text).toContain('incense +3炷')
    expect(text).toContain('vote 夯 accepted')
    expect(text).toContain('梁位=')
    expect(text).not.toContain('/v1/health')
    expect(text).not.toContain('/v1/snapshot')
    expect(logs.some((line) => line.includes('hello'))).toBe(true)
    expect(logs.filter((line) => line.includes('vote 夯'))).toHaveLength(1)
  })

  it('logs below_watermark instead of silently dropping a smaller claim', async () => {
    const logs: string[] = []
    const h = await start({ logs })
    await grant(h, 150_000)
    await grant(h, 10_000)
    const text = logs.join('\n')
    expect(text).toContain('claim ignored below_watermark')
    expect(text).toContain('requested=10000')
    expect(text).toContain('have=150000')
  })

  it('samples replay and rejection logs instead of amplifying every retry', async () => {
    const logs: string[] = []
    const h = await start({ logs })
    await grant(h, 50_000)
    const caseId = await activeCaseId(h)
    const accepted = { case_id: caseId, vote_type: 'up', request_id: 'req-sampled-replay-01' }
    await h.post('/v1/votes', accepted)
    for (let index = 0; index < 20; index += 1) await h.post('/v1/votes', accepted)
    for (let index = 0; index < 20; index += 1) {
      await h.post('/v1/votes', {
        case_id: caseId,
        vote_type: 'down',
        request_id: `req-sampled-reject-${String(index).padStart(2, '0')}`,
      })
    }

    expect(logs.filter(line => line.includes('replay=true'))).toHaveLength(1)
    expect(logs.filter(line => line.includes('rejected insufficient_incense'))).toHaveLength(1)
  })
})

describe('operator HTTP surface is closed', () => {
  it('returns 404 for former admin case/queue/unbind routes', async () => {
    const h = await start()
    for (const path of ['/v1/admin/cases', '/v1/admin/queue', '/v1/admin/identity/unbind']) {
      const response = await fetch(`${h.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '不该发出去的梁案' }),
      })
      expect(response.status).toBe(404)
      const body = await response.json() as { error?: { code?: string } }
      expect(body.error?.code).toBe('unknown_route')
    }
  })
})
