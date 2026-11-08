/**
 * Synchronized clients over signed loopback HTTP and a real SQLite WAL file.
 * The business clock is controlled; wall-clock latency is reported, never used
 * as a correctness threshold. This is not a production capacity certificate.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { Agent, request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { openBackendStore } from '../src/backend/store.ts'
import { createBackendClient } from '../src/host/backend-client.ts'
import { BackendLiangService } from '../src/host/backend-service.ts'
import { generateCommunityKeypair, signRequest, type CommunityKeypair } from '../src/host/community-keys.ts'
import { DayEndService } from '../src/host/day-end-service.ts'
import {
  DEVICE_HEADER, INSTALLATION_HEADER, LIANGZI_POLICY_HEADER, PUBLIC_KEY_HEADER,
  SIGNATURE_HEADER, TIMESTAMP_HEADER, WALLET_CAPABILITY_HEADER, WALLET_CAPABILITY_VERSION, parseV1VoteResponse, type V1VoteRequest,
} from '../src/shared/backend-v1.ts'
import { LIANGZI_POLICY_VERSION } from '../src/domain/index.ts'
import { DEFAULT_DAY_END, type DayEndState } from '../src/shared/day-end.ts'
import { createMutableClock } from './helpers/backend.ts'

const WINDOW_START = Date.UTC(2026, 9, 19, 15, 59)
const closeAll: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of closeAll.splice(0).reverse()) await close()
  vi.restoreAllMocks()
})

interface PreparedVote { body: string, headers: Record<string, string> }
interface Reply { status: number, body: unknown, latencyMs: number }

async function harness(now = WINDOW_START, maxSockets = 128) {
  const directory = mkdtempSync(join(tmpdir(), 'liangxiang-day-end-burst-'))
  const path = join(directory, 'community.sqlite')
  const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: path,
    LIANGXIANG_SNAPSHOT_SECONDS: '1', LIANGXIANG_STARTER_INCENSE: '0',
    LIANGXIANG_MAX_TOKENS_PER_MINUTE: '0', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0',
  }, () => undefined)
  const clock = createMutableClock(now)
  const store = openBackendStore(path)
  const service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
  const failures: string[] = []
  const api = createBackendHttpApi({ service, store, allowUnsigned: false,
    voteRateLimitPerMinute: 50, log: message => {
      if (/unhandled|SQLITE_BUSY|database is locked|internal error/i.test(message)) failures.push(message)
    } })
  // Keep test connections alive through assertions and replay. Slow runners
  // must not turn an unrelated idle-socket expiry into a vote failure.
  api.server.keepAliveTimeout = 60_000
  let acceptedConnections = 0
  api.server.on('connection', () => { acceptedConnections += 1 })
  await new Promise<void>(resolve => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  if (address === null || typeof address === 'string') throw new Error('Burst test did not bind')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const agent = new Agent({ keepAlive: true, maxSockets, maxTotalSockets: maxSockets, maxFreeSockets: maxSockets })
  const clientAgents = new Map<string, Agent>()
  const reader = new DatabaseSync(path, { readOnly: true })
  closeAll.push(async () => {
    agent.destroy()
    for (const client of clientAgents.values()) client.destroy()
    api.server.closeAllConnections()
    await new Promise<void>(resolve => api.server.close(() => resolve()))
    reader.close()
    store.close()
    rmSync(directory, { recursive: true, force: true })
  })
  const activeCase = service.bootstrap('fixture-bootstrap').active_case

  const enroll = (count: number, incense: number): CommunityKeypair[] => Array.from({ length: count }, (_, index) => {
    // Synthetic fingerprints and generated private keys stay in process only.
    const fingerprint = createHash('sha256').update(`concurrency-fixture-${index}`).digest('base64url')
    const identity = generateCommunityKeypair(fingerprint)
    store.upsertIdentity({ installation_id: identity.installationId, public_key: identity.publicKey,
      device_fingerprint: fingerprint, created_at: clock.now(), last_seen_at: clock.now() })
    service.applyTokenClaim(identity.installationId, {
      claim_business_date: service.businessDate(), claimed_effective_tokens: incense * config.tokenPerIncense,
    })
    return identity
  })

  const prepare = (identity: CommunityKeypair, intent: V1VoteRequest): PreparedVote => {
    const body = JSON.stringify(intent)
    const timestamp = Date.now()
    return { body, headers: {
      'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)),
      [LIANGZI_POLICY_HEADER]: LIANGZI_POLICY_VERSION,
      [WALLET_CAPABILITY_HEADER]: WALLET_CAPABILITY_VERSION,
      [INSTALLATION_HEADER]: identity.installationId, [PUBLIC_KEY_HEADER]: identity.publicKey,
      [TIMESTAMP_HEADER]: String(timestamp), [DEVICE_HEADER]: identity.deviceFingerprint ?? '',
      [SIGNATURE_HEADER]: signRequest({ privateKeyPem: identity.privateKeyPem,
        method: 'POST', path: '/v1/votes', timestamp, body, installationId: identity.installationId }),
    } }
  }

  const send = (prepared: PreparedVote): Promise<Reply> => new Promise((resolve, reject) => {
    const started = performance.now()
    const client = clientAgents.get(prepared.headers[INSTALLATION_HEADER] ?? '') ?? agent
    const req = request(`${baseUrl}/v1/votes`, { method: 'POST', headers: prepared.headers, agent: client }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { body += chunk })
      res.on('error', reject)
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(body) as unknown, latencyMs: performance.now() - started }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.setTimeout(30_000, () => req.destroy(new Error('Burst test HTTP timeout')))
    req.end(prepared.body)
  })

  const warmClients = async (identities: CommunityKeypair[]) => {
    // One independent connection per client, established before the vote
    // barrier in small batches. Test simultaneous votes rather than the OS's
    // cold TCP listen backlog, whose limit differs on Windows and macOS.
    for (let start = 0; start < identities.length; start += 64) {
      await Promise.all(identities.slice(start, start + 64).map(identity => {
        const client = new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 })
        clientAgents.set(identity.installationId, client)
        return new Promise<void>((resolve, reject) => {
          const req = request(`${baseUrl}/v1/health`, { agent: client }, res => {
            res.resume()
            res.on('error', reject)
            res.on('end', () => res.statusCode === 200 ? resolve() : reject(new Error('Warm-up health failed')))
          })
          req.on('error', reject)
          req.setTimeout(30_000, () => req.destroy(new Error('Warm-up HTTP timeout')))
          req.end()
        })
      }))
    }
  }

  const audit = () => {
    expect(reader.prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' })
    expect(reader.prepare('PRAGMA quick_check').get()).toMatchObject({ quick_check: 'ok' })
    expect(reader.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(failures).toEqual([])
    return {
      receipts: Number(reader.prepare('SELECT COUNT(*) AS n FROM liang_vote_request').get()?.n),
      acceptedRows: Number(reader.prepare('SELECT COUNT(*) AS n FROM liang_vote').get()?.n),
      used: Number(reader.prepare('SELECT SUM(used_incense) AS n FROM daily_incense_state').get()?.n ?? 0),
      overspent: Number(reader.prepare('SELECT COUNT(*) AS n FROM daily_incense_state WHERE used_incense < 0 OR used_incense * token_per_incense > claimed_effective_tokens').get()?.n),
    }
  }
  return { service, store, clock, api, baseUrl, activeCase, enroll, prepare, send, warmClients, audit,
    get connections() { return acceptedConnections } }
}

function measure(label: string, replies: Reply[], elapsedMs: number) {
  const sorted = replies.map(reply => reply.latencyMs).sort((a, b) => a - b)
  const percentile = (p: number) => Math.round((sorted[Math.ceil(sorted.length * p) - 1] ?? 0) * 10) / 10
  console.info(JSON.stringify({ scenario: label, requests: replies.length,
    elapsedMs: Math.round(elapsedMs), requestsPerSecond: Math.round(replies.length * 1_000 / elapsedMs),
    p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
    maxMs: percentile(1), statuses: replies.reduce<Record<number, number>>((counts, reply) => {
      counts[reply.status] = (counts[reply.status] ?? 0) + 1
      return counts
    }, {}) }))
}

describe('signed day-end bursts on a file-backed authority', () => {
  it('accepts 1000 independent clients at one business second and replays without another spend', async () => {
    const h = await harness()
    const identities = h.enroll(1_000, 20)
    await h.warmClients(identities)
    expect(h.connections).toBe(1_000)
    const prepared = identities.map((identity, index) => h.prepare(identity, {
      case_id: h.activeCase.id, vote_type: index % 2 === 0 ? 'up' : 'down',
      request_id: `day-end-burst-${index}`, count: 20,
    }))
    // All clients are ready before releasing the same barrier. The business
    // clock stays at exactly 23:59:00, even while real HTTP work takes time.
    let release: (() => void) | undefined
    const barrier = new Promise<void>(resolve => { release = resolve })
    const pending = prepared.map(async intent => { await barrier; return h.send(intent) })
    const started = performance.now()
    release?.()
    const replies = await Promise.all(pending)
    measure('1000 independent clients x 20', replies, performance.now() - started)
    expect(replies.every(reply => reply.status === 200)).toBe(true)
    for (const reply of replies) {
      expect(parseV1VoteResponse(reply.body).result).toMatchObject({ status: 'accepted', spent_incense: 20, remaining_incense: 0, replayed: false })
    }
    expect(h.service.snapshotResponse().global_snapshot).toMatchObject({
      up_votes: 10_000, down_votes: 10_000, total_incense: 20_000, unique_voters: 1_000,
    })
    for (const identity of identities) expect(h.store.incenseFor(identity.installationId, '2026-10-19'))
      .toMatchObject({ claimed_effective_tokens: 1_000_000, used_incense: 20 })
    expect(h.audit()).toEqual({ receipts: 1_000, acceptedRows: 1_000, used: 20_000, overspent: 0 })
    expect(h.connections).toBe(1_000)

    const replayStarted = performance.now()
    const replay = await Promise.all(prepared.map(h.send))
    measure('1000 identical retries', replay, performance.now() - replayStarted)
    expect(replay.every(reply => reply.status === 200)).toBe(true)
    for (const reply of replay) expect(parseV1VoteResponse(reply.body).result).toMatchObject({ status: 'accepted', spent_incense: 0, replayed: true })
    expect(h.audit()).toEqual({ receipts: 1_000, acceptedRows: 1_000, used: 20_000, overspent: 0 })
    expect(h.service.snapshotResponse().global_snapshot).toMatchObject({ total_incense: 20_000, unique_voters: 1_000 })
  }, 60_000)

  it('keeps each of 100 shared manual/automatic pools atomic with simultaneous duplicate IDs', async () => {
    const h = await harness()
    const identities = h.enroll(100, 20)
    const prepared = identities.flatMap((identity, index) => {
      const automatic = h.prepare(identity, { case_id: h.activeCase.id, vote_type: 'up', request_id: `auto-race-${index}`, count: 20 })
      const manual = h.prepare(identity, { case_id: h.activeCase.id, vote_type: 'down', request_id: `manual-race-${index}`, count: 1 })
      return index % 2 === 0 ? [manual, automatic, automatic, manual] : [automatic, manual, manual, automatic]
    })
    const replies = await Promise.all(prepared.map(h.send))
    expect(replies.every(reply => reply.status === 200 || reply.status === 409)).toBe(true)
    const unique = new Map<string, Array<ReturnType<typeof parseV1VoteResponse>['result']>>()
    replies.forEach((reply, index) => {
      const response = parseV1VoteResponse(reply.body)
      const intent = JSON.parse(prepared[index]!.body) as V1VoteRequest
      const group = unique.get(intent.request_id) ?? []
      group.push(response.result)
      unique.set(intent.request_id, group)
    })
    let spent = 0
    for (const [requestId, group] of unique) {
      expect(group).toHaveLength(2)
      const first = group[0]!
      for (const result of group) expect(result).toMatchObject({ status: first.status, request_id: requestId })
      if (first.status === 'accepted') {
        expect(group.filter(result => result.status === 'accepted' && !result.replayed)).toHaveLength(1)
        for (const result of group) if (result.status === 'accepted') {
          if (result.replayed) expect(result.spent_incense).toBe(0)
          else spent += result.spent_incense ?? 1
        }
      } else for (const result of group) if (result.status === 'rejected') expect(result.reason).toBe(first.reason)
    }
    expect(spent).toBe(2_000)
    const snapshot = h.service.snapshotResponse().global_snapshot
    expect(snapshot.total_incense).toBe(2_000)
    expect(snapshot.up_votes + snapshot.down_votes).toBe(2_000)
    expect(snapshot.unique_voters).toBe(100)
    for (const identity of identities) expect(h.service.dailyState(identity.installationId).authoritative_personal_state)
      .toMatchObject({ earned_incense: 20, used_incense: 20, remaining_incense: 0 })
    expect(h.audit()).toMatchObject({ receipts: 200, used: 2_000, overspent: 0 })
  }, 30_000)

  it('spends each last stick once under 2176 contending manual, automatic and duplicate requests', async () => {
    // Queue every intent together, with bounded transport pressure for parallel
    // full-suite runs. The independent-client capacity case above still opens
    // 1000 sockets; this case checks atomicity under repeated shared-pool races.
    const h = await harness(undefined, 128)
    const identities = h.enroll(64, 1)
    const prepared = identities.flatMap((identity, index) => {
      const manual = Array.from({ length: 16 }, (_, i) => h.prepare(identity, {
        case_id: h.activeCase.id, vote_type: 'down', request_id: `extreme-manual-${index}-${i}`, count: 1,
      }))
      const automatic = h.prepare(identity, { case_id: h.activeCase.id, vote_type: 'up',
        request_id: `extreme-auto-${index}`, count: 500 })
      const intents = index % 2 === 0 ? [automatic, ...manual] : [...manual, automatic]
      return intents.flatMap(intent => [intent, intent])
    })
    const replies = await Promise.all(prepared.map(h.send))
    expect(replies).toHaveLength(2_176)
    expect(replies.every(reply => reply.status === 200 || reply.status === 409)).toBe(true)
    const accepted = replies.map(reply => parseV1VoteResponse(reply.body).result)
      .filter(result => result.status === 'accepted')
    expect(accepted.filter(result => !result.replayed)).toHaveLength(64)
    expect(accepted.filter(result => result.replayed)).toHaveLength(64)
    expect(accepted.reduce((sum, result) => sum + (result.spent_incense ?? 0), 0)).toBe(64)
    for (const identity of identities) expect(h.service.dailyState(identity.installationId).authoritative_personal_state)
      .toMatchObject({ earned_incense: 1, used_incense: 1, remaining_incense: 0 })
    expect(h.service.snapshotResponse().global_snapshot).toMatchObject({ total_incense: 64, unique_voters: 64 })
    expect(h.audit()).toEqual({ receipts: 1_088, acceptedRows: 64, used: 64, overspent: 0 })
  }, 30_000)

  it('retains per-client budget clamping and immutable retry/conflict receipts at burst time', async () => {
    // Hold the limiter's wall clock too: slower CI must not refill one token
    // between the accepted batch and the assertion that new work is 429'd.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now())
    const h = await harness()
    const identities = h.enroll(64, 1_000)
    const first = identities.map((identity, index) => h.prepare(identity, {
      case_id: h.activeCase.id, vote_type: 'up', request_id: `limited-auto-${index}`, count: 500,
    }))
    const accepted = await Promise.all(first.map(h.send))
    for (const reply of accepted) expect(parseV1VoteResponse(reply.body).result).toMatchObject({ status: 'accepted', spent_incense: 50 })
    const later = identities.map((identity, index) => h.prepare(identity, {
      case_id: h.activeCase.id, vote_type: 'down', request_id: `limited-new-${index}`, count: 1,
    }))
    const rejected = await Promise.all(later.map(h.send))
    expect(rejected.every(reply => reply.status === 429)).toBe(true)
    const replays = await Promise.all(first.map(h.send))
    expect(replays.every(reply => reply.status === 200)).toBe(true)
    for (const reply of replays) expect(parseV1VoteResponse(reply.body).result).toMatchObject({ status: 'accepted', replayed: true, spent_incense: 0 })
    const conflicts = await Promise.all(identities.map((identity, index) => h.send(h.prepare(identity, {
      case_id: h.activeCase.id, vote_type: 'down', request_id: `limited-auto-${index}`, count: 500,
    }))))
    for (const reply of conflicts) {
      expect(reply.status).toBe(409)
      expect(parseV1VoteResponse(reply.body).result).toMatchObject({ status: 'rejected', reason: 'idempotency_conflict' })
    }
    for (const identity of identities) expect(h.service.dailyState(identity.installationId).authoritative_personal_state)
      .toMatchObject({ earned_incense: 1_000, used_incense: 50, remaining_incense: 950 })
    expect(h.audit()).toEqual({ receipts: 64, acceptedRows: 64, used: 3_200, overspent: 0 })
  }, 30_000)

  it('rejects a synchronized old-case batch after midnight without spending the new day', async () => {
    const h = await harness(Date.UTC(2026, 9, 19, 15, 59, 59))
    const identities = h.enroll(128, 20)
    const stale = identities.map((identity, index) => h.prepare(identity, {
      case_id: h.activeCase.id, vote_type: 'up', request_id: `late-auto-${index}`, count: 20,
    }))
    h.clock.advance(2_000)
    const replies = await Promise.all(stale.map(h.send))
    for (const reply of replies) {
      expect(reply.status).toBe(409)
      expect(parseV1VoteResponse(reply.body).result).toMatchObject({ status: 'rejected', reason: 'case_not_active' })
    }
    const nextDay = h.service.snapshotResponse()
    expect(nextDay.business_date).toBe('2026-10-20')
    expect(nextDay.global_snapshot).toMatchObject({ total_incense: 0, unique_voters: 0 })
    for (const identity of identities) {
      expect(h.store.incenseFor(identity.installationId, '2026-10-19')?.used_incense).toBe(0)
      expect(h.service.dailyState(identity.installationId).authoritative_personal_state)
        .toMatchObject({ earned_incense: 0, used_incense: 0, remaining_incense: 20 })
    }
    const replay = await Promise.all(stale.map(h.send))
    expect(replay.every(reply => reply.status === 409)).toBe(true)
    expect(h.audit()).toEqual({ receipts: 128, acceptedRows: 0, used: 0, overspent: 0 })
  }, 30_000)

  it('runs 32 real day-end Hosts through BackendClient, signed HTTP and the shared SQLite authority', async () => {
    const h = await harness()
    const identities = h.enroll(32, 20)
    const states: DayEndState[] = []
    const rituals = await Promise.all(identities.map(async identity => {
      const client = createBackendClient({ baseUrl: h.baseUrl, signer: () => identity })
      const host = new BackendLiangService({ client, timezone: 'Asia/Shanghai', clock: h.clock, warn: () => undefined, claimDebounceMs: 0 })
      host.attachCommunityIdentity(identity)
      await host.refreshBootstrap()
      expect(host.getWireState().personal.remainingIncense).toBe(20)
      const ritual = new DayEndService(host, h.clock, () => false, () => undefined)
      closeAll.push(() => ritual.dispose())
      const state = { ...structuredClone(DEFAULT_DAY_END), enabled: true }
      const index = states.push(state) - 1
      ritual.attachDayEndPersistence({ getDayEndState: () => states[index]!,
        setDayEndState: async next => { states[index] = structuredClone(next) } })
      return ritual
    }))
    for (const ritual of rituals) ritual.startDayEnd()
    await expect.poll(() => states.every(state => state.jobs.online?.done === true), { timeout: 15_000 }).toBe(true)
    expect(h.service.snapshotResponse().global_snapshot).toMatchObject({ total_incense: 640, unique_voters: 32 })
    for (const identity of identities) expect(h.service.dailyState(identity.installationId).authoritative_personal_state)
      .toMatchObject({ used_incense: 20, remaining_incense: 0 })
    expect(h.audit()).toEqual({ receipts: 32, acceptedRows: 32, used: 640, overspent: 0 })
  }, 30_000)
})
