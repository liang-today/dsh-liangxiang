import { request as httpRequest } from 'node:http'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { generateCommunityKeypair, signRequest } from '../src/host/community-keys.ts'
import { INSTALLATION_HEADER, PUBLIC_KEY_HEADER, TIMESTAMP_HEADER, SIGNATURE_HEADER, WALLET_CAPABILITY_HEADER, WALLET_CAPABILITY_VERSION } from '../src/shared/backend-v1.ts'
import { vi } from 'vitest'
import { apiErrorDetail } from '../src/shared/api-error.ts'
import { describe, expect, it } from 'vitest'
import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { readBoundedBody } from '../src/shared/node-http-body.ts'
import { aggregateBars } from '../src/domain/bars.ts'
import type { BarsCandle } from '../src/shared/bars-v1.ts'
import { barsDayPath } from '../src/host/bars-store.ts'
import { parseV1Bootstrap, parseV1SnapshotResponse, parseV1PublishCaseResponse, parseV1VoteRequest } from '../src/shared/backend-v1.ts'
import { mergeDailyUsage } from '../src/host/usage-ledger.ts'
import { liangQiFloatPeriodMs } from '../src/domain/presentation.ts'
import { createBackendFixture } from './helpers/backend.ts'
import { VoteRateLimiter } from '../src/backend/vote-rate-limit.ts'
import { IdentityRateLimiter, IDENTITY_MISS_WINDOW_MS } from '../src/backend/identity-rate-limit.ts'

describe('network and ledger reliability boundaries', () => {
  it('preserves every UTF-8 split and applies the byte limit before decoding', async () => {
    const body = Buffer.from('{"text":"中文🐟"}')
    for (let split = 1; split < body.length; split++) {
      const stream = new PassThrough()
      const result = readBoundedBody(stream as unknown as IncomingMessage, body.length)
      stream.write(body.subarray(0, split)); stream.end(body.subarray(split))
      expect(await result).toBe(body.toString('utf8'))
    }
    const large = new PassThrough()
    const result = readBoundedBody(large as unknown as IncomingMessage, 4096)
    large.end(Buffer.from('中'.repeat(1800)))
    await expect(result).rejects.toThrow('request body too large')
    large.destroy()
  })
  it('keeps observed vote counts when a gap occupies the same wider candle', () => {
    const candle: BarsCandle = { t: 0, open: .5, high: .5, low: .5, close: .5,
      upVotes: 10, downVotes: 10, samples: 1, caseId: 'case-one', gap: false }
    const gap: BarsCandle = { ...candle, t: 30000, open: null, high: null, low: null, close: null,
      upVotes: 0, downVotes: 0, samples: 0, gap: true }
    expect(aggregateBars([candle, gap], 30000, 300000)[0]).toMatchObject({ upVotes: 10, downVotes: 10, samples: 1 })
    expect(aggregateBars([candle, { ...candle, t: 60000, caseId: 'case-two', upVotes: 1, downVotes: 0 }], 30000, 300000)[0]).toMatchObject({ caseId: 'case-two', upVotes: 1, downVotes: 0 })
  })
  it.each(['../../escape', '2026-02-30', '2026-13-01', '2026-01-01/extra'])('rejects unsafe day filenames: %s', value => {
    expect(() => barsDayPath('/tmp/liangxiang-bars-test', value)).toThrow('invalid bars business date')
  })
  it('rejects inconsistent dates in current-state envelopes', () => {
    const f = createBackendFixture()
    try {
      expect(() => parseV1Bootstrap({ ...f.service.bootstrap('reader-boundary'), business_date: '2026-08-15' })).toThrow('must agree')
      expect(() => parseV1SnapshotResponse({ ...f.service.snapshotResponse(), business_date: '2026-08-15' })).toThrow('must agree')
      expect(() => parseV1PublishCaseResponse({ ...f.service.publishCase('另一案'), business_date: '2026-08-15' })).toThrow('must agree')
    } finally { f.close() }
  })
  it('does not combine a consumed fractional carry with a newer whole token', () => {
    const older = { inputTokens: 0, outputTokens: 0, weightCarry: 5000, observedAt: 1 }
    const newer = { inputTokens: 1, outputTokens: 0, weightCarry: 0, observedAt: 2 }
    expect(mergeDailyUsage(older, newer)).toEqual(newer)
    expect(mergeDailyUsage(newer, older)).toEqual(newer)
  })
  it('does not extend a shared-exit cooldown with denied probes', () => {
    const limiter = new IdentityRateLimiter()
    expect(limiter.check(1, 'shared-exit', 'first', 'miss').allowed).toBe(true)
    expect(limiter.check(100, 'shared-exit', 'probe', 'miss').allowed).toBe(false)
    expect(limiter.check(IDENTITY_MISS_WINDOW_MS + 1, 'shared-exit', 'next', 'miss').allowed).toBe(true)
  })
  it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid internal work counts even with limits disabled: %s', count => {
    expect(() => new VoteRateLimiter(0, 4).consume('identity', count, 0)).toThrow('positive safe integer')
  })
  it('rejects unexpected vote payload fields without trusting caller accounting', () => {
    expect(() => parseV1VoteRequest({ case_id: 'case', vote_type: 'up', request_id: 'bounded-request', note: 'unnecessary' })).toThrow('unknown vote field')
  })
  it('preserves the historical progress-only bob cadence', () => {
    expect([0, .25, .5, .75, 1].map(liangQiFloatPeriodMs)).toEqual([4800, 3875, 2950, 2025, 1100])
  })
})


it('normalizes old and new error envelopes without changing their meaning', () => {
  expect(apiErrorDetail({ error: 'network unavailable' }, 503)).toEqual({ code: 'authority_unavailable', message: 'network unavailable' })
  expect(apiErrorDetail({ error: { code: 'vote_rate_limited', message: '稍后再上香' } }, 429)).toEqual({ code: 'vote_rate_limited', message: '稍后再上香' })
  expect(apiErrorDetail({ ok: true }, 200)).toBeNull()
})


it('keeps public inventory reads read-only even when tickets expire', () => {
  const f = createBackendFixture()
  try {
    f.service.issueAdmissionTickets(1, 1, 1)
    const expiry = vi.spyOn(f.store, 'expireAdmissionTickets')
    f.clock.advance(2 * 3600000)
    expect(f.service.admissionTickets().tickets).toHaveLength(0)
    expect(f.service.admissionInventory().expiredTickets).toBe(1)
    expect(f.service.listAdmissionTickets()).toHaveLength(0)
    expect(expiry).not.toHaveBeenCalled()
    expect(f.service.retentionFootprint()).toMatchObject({ daily_incense_state: 0, liang_vote_request: 0 })
  } finally { f.close() }
})


it('authenticates identical Chinese JSON bytes across real HTTP chunks and rejects byte overflow', async () => {
  const f = createBackendFixture({}, Date.now()), key = generateCommunityKeypair(null)
  f.store.upsertIdentity({ installation_id: key.installationId, public_key: key.publicKey, device_fingerprint: null, created_at: Date.now(), last_seen_at: Date.now() })
  const api = createBackendHttpApi({ service: f.service, store: f.store, voteRateLimitPerMinute: 0, log: () => undefined })
  await new Promise<void>(resolve => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  if (!address || typeof address === 'string') throw new Error('no test address')
  const send = async (title: string, split: boolean): Promise<number> => {
    const body = JSON.stringify({ case_id: title, vote_type: 'up', request_id: 'chinese-signed-http', count: 1 })
    const bytes = Buffer.from(body), timestamp = Date.now()
    const headers = { 'content-type': 'application/json', 'content-length': bytes.length,
      [INSTALLATION_HEADER]: key.installationId, [PUBLIC_KEY_HEADER]: key.publicKey, [TIMESTAMP_HEADER]: String(timestamp),
      [WALLET_CAPABILITY_HEADER]: WALLET_CAPABILITY_VERSION,
      [SIGNATURE_HEADER]: signRequest({ privateKeyPem: key.privateKeyPem, installationId: key.installationId, method: 'POST', path: '/v1/votes', timestamp, body }) }
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port: address.port, method: 'POST', path: '/v1/votes', headers }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode!))
      })
      req.on('error', reject)
      if (split) { const cut = bytes.indexOf(Buffer.from('中')) + 1; req.write(bytes.subarray(0, cut)); setTimeout(() => req.end(bytes.subarray(cut)), 25) }
      else req.end(bytes)
    })
  }
  try {
    expect(await send('中文旧案', false)).toBe(409)
    expect(await send('中文旧案', true)).toBe(409)
    expect(await send('中'.repeat(1800), false)).toBe(413)
  } finally { api.reset(); await new Promise<void>(resolve => api.server.close(() => resolve())); f.close() }
})
