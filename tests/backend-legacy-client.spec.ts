/** Real published 1.2.0 request/validator logic against the candidate HTTP service. */
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { authenticateCommunityRequest } from '../src/backend/community-auth.ts'
import { MarketLedger } from '../src/backend/market-ledger.ts'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { openBackendStore, type BackendStore } from '../src/backend/store.ts'
import { BackendLiangService } from '../src/host/backend-service.ts'
import { createBackendClient } from '../src/host/backend-client.ts'
import { generateCommunityKeypair, type CommunityKeypair } from '../src/host/community-keys.ts'
import { DEVICE_HEADER, INSTALLATION_HEADER, PUBLIC_KEY_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER,
  WALLET_CAPABILITY_HEADER, WALLET_CAPABILITY_VERSION } from '../src/shared/backend-v1.ts'
import { createBackendClient as createLegacyClient } from './fixtures/legacy-1.2/backend-client.ts'
import { LiangxiangBackendService as LegacyBackendService } from './fixtures/legacy-1.2/backend-service.ts'
import { createBackendFixture, createMutableClock } from './helpers/backend.ts'

const START = Date.UTC(2026, 7, 16, 1, 5)
const DAY = 86_400_000
const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('listener missing')
  return `http://127.0.0.1:${address.port}`
}
function enroll(store: BackendStore, fingerprint: string): CommunityKeypair {
  const key = generateCommunityKeypair(fingerprint)
  store.upsertIdentity({ installation_id: key.installationId, public_key: key.publicKey,
    device_fingerprint: fingerprint, created_at: START, last_seen_at: START })
  return key
}
async function modernServer() {
  const f = createBackendFixture({}, START)
  const api = createBackendHttpApi({ service: f.service, store: f.store, voteRateLimitPerMinute: 0, log: () => undefined })
  const baseUrl = await listen(api.server)
  cleanups.push(async () => { api.reset(); await new Promise<void>(resolve => api.server.close(() => resolve())); f.close() })
  const key = enroll(f.store, 'legacy-compatible-installation')
  const legacy = createLegacyClient({ baseUrl, signer: () => key })
  const modern = createBackendClient({ baseUrl, signer: () => key })
  cleanups.push(() => { legacy.dispose(); modern.dispose() })
  const ledger = new MarketLedger(f.store, 'Asia/Shanghai')
  return { ...f, api, key, legacy, modern, baseUrl, ledger }
}

/** Frozen 1.2 service behind its original basic routes; unknown market/SSE stay 404. */
async function legacyServer() {
  const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: ':memory:', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0' })
  const clock = createMutableClock(START), store = openBackendStore(':memory:')
  const service = new LegacyBackendService({ store, config, clock, warn: () => undefined })
  const key = enroll(store, 'pre-wallet-backend-installation')
  let upgraded: ReturnType<typeof createBackendHttpApi> | undefined
  const capabilities: Array<string | undefined> = []
  const server = createServer((req, res) => {
    const run = async (): Promise<void> => {
      if (upgraded !== undefined) return upgraded.handler(req, res)
      let body = ''
      for await (const chunk of req) body += String(chunk)
      const path = (req.url ?? '/').split('?')[0]!
      capabilities.push(req.headers[WALLET_CAPABILITY_HEADER] as string | undefined)
      if (path === '/v1/events' || path.startsWith('/v1/market')) {
        res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'unknown_route', message: 'unknown route' } })); return
      }
      if (path !== '/v1/snapshot' && path !== '/v1/history') authenticateCommunityRequest({ store,
        method: req.method ?? 'GET', path: req.url ?? '/', body, installationId: String(req.headers[INSTALLATION_HEADER]),
        publicKey: String(req.headers[PUBLIC_KEY_HEADER]), timestamp: String(req.headers[TIMESTAMP_HEADER]),
        signature: String(req.headers[SIGNATURE_HEADER]), deviceFingerprint: String(req.headers[DEVICE_HEADER]), now: Date.now() })
      const id = String(req.headers[INSTALLATION_HEADER])
      const payload = path === '/v1/bootstrap' ? service.bootstrap(id)
        : path === '/v1/me/daily-state' ? service.dailyState(id)
        : path === '/v1/token-claims' ? service.applyTokenClaim(id, JSON.parse(body))
        : path === '/v1/votes' ? service.vote(id, JSON.parse(body))
        : path === '/v1/snapshot' ? service.snapshotResponse() : service.historyResponse()
      const status = 'result' in payload && payload.result.status === 'rejected' ? 409 : 200
      res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload))
    }
    void run().catch(error => { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'internal_error', message: String(error) } })) })
  })
  const baseUrl = await listen(server)
  const legacy = createLegacyClient({ baseUrl, signer: () => key }), modern = createBackendClient({ baseUrl, signer: () => key })
  cleanups.push(async () => { legacy.dispose(); modern.dispose(); upgraded?.reset(); await new Promise<void>(resolve => server.close(() => resolve())); store.close() })
  return { clock, store, key, legacy, modern, capabilities, baseUrl, upgrade: () => {
    const next = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
    upgraded = createBackendHttpApi({ service: next, store, voteRateLimitPerMinute: 0, log: () => undefined })
    return next
  } }
}

describe('published 1.2 clients during cumulative-wallet rollout', () => {
  it('keeps signed old bootstrap, actual claims, count intents, replay and history usable', async () => {
    const h = await modernServer(), id = h.key.installationId
    const boot = await h.legacy.bootstrap(id)
    expect(boot.authoritative_personal_state).toMatchObject({ earned_incense: 10, remaining_incense: 10 })
    const claim = await h.legacy.submitClaim(id, 750_000, boot.business_date)
    expect(claim.authoritative_personal_state).toMatchObject({ claimed_effective_tokens: 750_000, earned_incense: 15 })
    const intent = { case_id: boot.active_case.id, vote_type: 'up' as const, request_id: 'legacy-count-four', count: 4 }
    const first = await h.legacy.vote(id, intent), replay = await h.legacy.vote(id, intent)
    expect(first.result).toMatchObject({ status: 'accepted', spent_incense: 4, replayed: false })
    expect(replay.result).toMatchObject({ status: 'accepted', spent_incense: 0, replayed: true })
    expect(first.authoritative_personal_state).toMatchObject({ used_incense: 4, remaining_incense: 11 })
    expect((await h.legacy.vote(id, { ...intent, count: 3 })).result).toMatchObject({ status: 'rejected', reason: 'idempotency_conflict' })
    expect((await h.legacy.snapshot()).global_snapshot.total_incense).toBe(4)
    expect((await h.legacy.history()).stale).toBe(false)
    expect(h.service.marketState(id).wallet.available_incense).toBe(11)
  })

  it('expires old daily funds/progress and imports only the upgrade day, without historical catch-up', async () => {
    const h = await modernServer(), id = h.key.installationId
    const first = await h.legacy.bootstrap(id)
    await h.legacy.submitClaim(id, 525_000, first.business_date)
    h.clock.advance(DAY)
    h.service.tick()
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 0, token_remainder: 0 })
    const next = await h.legacy.bootstrap(id)
    expect(next.authoritative_personal_state).toMatchObject({ claimed_effective_tokens: 500_000, earned_incense: 10,
      used_incense: 0, remaining_incense: 10, token_remainder: 0 })
    await h.legacy.submitClaim(id, 525_000, next.business_date)
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 10, token_remainder: 25_000 })
    const accepted = await h.legacy.vote(id, { case_id: next.active_case.id, vote_type: 'down', count: 7, request_id: 'legacy-before-opt-in' })
    expect(accepted.result).toMatchObject({ status: 'accepted', spent_incense: 7, remaining_incense: 3 })
    const upgrade = await h.modern.bootstrap(id)
    expect(upgrade.authoritative_personal_state.wallet).toMatchObject({ available_incense: 3, token_remainder: 25_000 })
    await h.modern.bootstrap(id)
    expect(h.ledger.wallet(id).available_incense).toBe(3)
    h.clock.advance(DAY)
    const carried = await h.modern.bootstrap(id)
    expect(carried.authoritative_personal_state.wallet).toMatchObject({ available_incense: 13, token_remainder: 25_000 })
    await h.modern.submitClaim(id, 525_000, carried.business_date)
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 14, token_remainder: 0 })
    const journal = h.store.database.prepare('SELECT SUM(available_delta) AS available,SUM(frozen_delta) AS frozen FROM incense_wallet_entry WHERE installation_id=?').get(id)
    expect(journal).toMatchObject({ available: 14, frozen: 0 })
    expect(h.store.database.prepare('SELECT COUNT(*) AS n FROM community_identity').get()!.n).toBe(1)
    expect(h.store.database.prepare('SELECT COUNT(*) AS n FROM starter_incense_grant').get()!.n).toBe(3)
  })

  it('serializes two old requests for the last daily stick without spending carried funds', async () => {
    const h = await modernServer(), id = h.key.installationId
    await h.legacy.bootstrap(id); h.clock.advance(DAY)
    const boot = await h.legacy.bootstrap(id)
    await h.legacy.vote(id, { case_id: boot.active_case.id, vote_type: 'up', count: 9, request_id: 'legacy-nine-before-race' })
    const results = await Promise.all(['legacy-last-a', 'legacy-last-b'].map(request_id => h.legacy.vote(id,
      { case_id: boot.active_case.id, vote_type: 'down', count: 500, request_id })))
    expect(results.filter(row => row.result.status === 'accepted')).toHaveLength(1)
    expect(results.filter(row => row.result.status === 'rejected')).toHaveLength(1)
    expect(h.ledger.wallet(id).available_incense).toBe(0)
    expect((await h.legacy.dailyState(id)).authoritative_personal_state).toMatchObject({ used_incense: 10, remaining_incense: 0 })
    expect((await h.legacy.snapshot()).global_snapshot.total_incense).toBe(10)
  })

  it('spends the last daily stick only once while a new client activates the same identity', async () => {
    const h = await modernServer(), id = h.key.installationId
    const boot = await h.legacy.bootstrap(id)
    await h.legacy.vote(id, { case_id: boot.active_case.id, vote_type: 'up', count: 9, request_id: 'activation-race-nine' })
    const intents = ['activation-race-modern', 'activation-race-old'].map(request_id => ({
      case_id: boot.active_case.id, vote_type: 'down' as const, count: 500, request_id }))
    const results = await Promise.allSettled([h.modern.vote(id, intents[0]!), h.legacy.vote(id, intents[1]!)])
    const accepted = results.filter(result => result.status === 'fulfilled' && result.value.result.status === 'accepted')
    expect(accepted).toHaveLength(1)
    expect(h.ledger.wallet(id)).toMatchObject({ available_incense: 0, frozen_incense: 0 })
    expect((await h.modern.snapshot()).global_snapshot.total_incense).toBe(10)
    await expect(h.legacy.bootstrap(id)).rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
  })

  it('gates downgraded requests before writes while preserving the opted-in wallet and frozen assets', async () => {
    const h = await modernServer(), id = h.key.installationId
    await h.modern.bootstrap(id)
    const state = await h.modern.market!(id)
    await h.modern.marketPosition!(id, { market_id: state.market!.id, batch: 1, side: 'long', amount: 8, request_id: 'legacy-freeze-eight' })
    const before = h.service.marketState(id).wallet
    await expect(h.legacy.bootstrap(id)).rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
    await expect(h.legacy.vote(id, { case_id: state.market!.case_id, vote_type: 'up', request_id: 'legacy-frozen-vote' }))
      .rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
    expect(h.service.marketState(id).wallet).toEqual(before)
    expect(h.service.dailyState(id).authoritative_personal_state).toMatchObject({ claimed_effective_tokens: 500_000, used_incense: 0 })
    // The incompatible binary cannot mutate claims, gift state or money.
    await expect(h.legacy.submitClaim(id, 510_000, state.market!.business_date))
      .rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
    const afterClaim = h.service.dailyState(id).authoritative_personal_state
    expect(afterClaim).toMatchObject({ claimed_effective_tokens: 500_000, used_incense: 0 })
    expect(afterClaim.wallet).toMatchObject({ available_incense: 2, frozen_incense: 8, token_remainder: 0 })
    await expect(h.legacy.submitClaim(id, 510_000, state.market!.business_date))
      .rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
    expect(h.service.dailyState(id).authoritative_personal_state.wallet).toEqual(afterClaim.wallet)
    await h.modern.marketPosition!(id, { market_id: state.market!.id, batch: 1, side: null, amount: 0, request_id: 'legacy-unfreeze-eight' })
    await expect(h.legacy.bootstrap(id)).rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
    h.clock.advance(DAY)
    const current = await h.modern.bootstrap(id)
    await h.modern.vote(id, { case_id: current.active_case.id, vote_type: 'up', count: 11, request_id: 'modern-spends-carry' })
    await expect(h.legacy.dailyState(id)).rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
    expect(h.service.dailyState(id).authoritative_personal_state).toMatchObject({ claimed_effective_tokens: 500_000, used_incense: 11 })
  })

  it('treats capabilities as a protocol choice, never as authentication or a second balance', async () => {
    const h = await modernServer(), id = h.key.installationId
    const denied = await fetch(`${h.baseUrl}/v1/bootstrap`, { headers: {
      [INSTALLATION_HEADER]: id, [WALLET_CAPABILITY_HEADER]: WALLET_CAPABILITY_VERSION } })
    expect(denied.status).toBe(401)
    expect(h.store.database.prepare('SELECT COUNT(*) AS n FROM incense_wallet').get()!.n).toBe(0)
    await h.modern.bootstrap(id); h.clock.advance(DAY)
    const unknown = createBackendClient({ baseUrl: h.baseUrl, signer: () => h.key, fetchImpl: (input, init) => {
      const headers = new Headers(init?.headers); headers.set(WALLET_CAPABILITY_HEADER, 'unrecognized-wallet-version')
      return fetch(input, { ...init, headers })
    } })
    cleanups.push(() => unknown.dispose())
    await expect(unknown.bootstrap(id)).rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
    expect(h.service.marketState(id).wallet.available_incense).toBe(20)
  })

  it('does not silently enable a daily account through a market or stream request without wallet capability', async () => {
    const h = await modernServer(), id = h.key.installationId
    await h.legacy.bootstrap(id)
    const oldTransport = createBackendClient({ baseUrl: h.baseUrl, signer: () => h.key, fetchImpl: (input, init) => {
      const headers = new Headers(init?.headers); headers.delete(WALLET_CAPABILITY_HEADER)
      return fetch(input, { ...init, headers })
    } })
    cleanups.push(() => oldTransport.dispose())
    await expect(oldTransport.market!(id)).rejects.toMatchObject({ status: 412, code: 'wallet_upgrade_required' })
    expect(h.store.database.prepare('SELECT cumulative_since FROM incense_wallet WHERE installation_id=?').get(id)!.cumulative_since).toBeNull()
    expect((await h.legacy.bootstrap(id)).authoritative_personal_state.remaining_incense).toBe(10)
    expect(h.ledger.wallet(id).available_incense).toBe(10)
  })

  it('upgrades the same daily identity and exact claim watermark once without duplicating gifts or funds', async () => {
    const h = await legacyServer(), id = h.key.installationId
    const boot = await h.legacy.bootstrap(id)
    await h.legacy.submitClaim(id, 625_000, boot.business_date)
    await h.legacy.vote(id, { case_id: boot.active_case.id, vote_type: 'up', count: 3, request_id: 'legacy-before-upgrade' })
    const service = h.upgrade()
    expect((await h.modern.bootstrap(id)).authoritative_personal_state.wallet).toMatchObject({ available_incense: 9, token_remainder: 25_000 })
    await h.modern.submitClaim(id, 750_000, boot.business_date)
    await expect(h.legacy.submitClaim(id, 625_000, boot.business_date)).rejects.toMatchObject({ code: 'wallet_upgrade_required' })
    expect(service.marketState(id).wallet).toMatchObject({ available_incense: 12, token_remainder: 0 })
    const replay = await h.modern.vote(id, { case_id: boot.active_case.id, vote_type: 'up', count: 3, request_id: 'legacy-before-upgrade' })
    expect(replay.result).toMatchObject({ status: 'accepted', replayed: true, spent_incense: 0 })
    expect(service.marketState(id).wallet.available_incense).toBe(12)
    await expect(h.legacy.bootstrap(id)).rejects.toMatchObject({ code: 'wallet_upgrade_required' })
    expect(h.store.database.prepare('SELECT COUNT(*) AS n FROM community_identity').get()!.n).toBe(1)
    expect(h.store.database.prepare('SELECT COUNT(*) AS n FROM starter_incense_grant').get()!.n).toBe(1)
  })

  it('keeps the real new Host earning, claiming, voting and reading archives against the frozen old service', async () => {
    const h = await legacyServer(), id = h.key.installationId
    const host = new BackendLiangService({ client: h.modern, clock: h.clock, timezone: 'Asia/Shanghai', claimDebounceMs: 0, warn: () => undefined })
    cleanups.push(() => host.dispose())
    host.attachIdentity(id); await host.refreshBootstrap()
    expect(host.getWireState()).toMatchObject({ authorityAvailable: true, personal: { remainingIncense: 10 } })
    host.observeUsage('legacy-backend-live-request', { kind: 'settled-requests', throughOffset: 3,
      requests: [{ startOffset: 1, endOffset: 3, endedAt: h.clock.now(), provider: 'deepseek-official', model: 'deepseek-v4-pro', inputTokens: 150_000, outputTokens: 0 }] },
    { kind: 'live', firstLiveSeq: 0 })
    await host.vote({ caseId: host.getWireState().activeCase.id, voteType: 'down', count: 2, requestId: 'new-host-old-backend-vote' })
    expect(host.getWireState()).toMatchObject({ authorityAvailable: true, personal: { remainingIncense: 11, usedIncenseToday: 2 } })
    h.clock.advance(DAY)
    await host.refreshNow()
    expect(host.getWireState()).toMatchObject({ authorityAvailable: true, personal: { remainingIncense: 10, usedIncenseToday: 0 } })
    const archive = await host.history()
    expect(archive.days).toHaveLength(1)
    expect(archive.days[0]).toMatchObject({ up_votes: 0, down_votes: 2 })
    await expect(host.market()).rejects.toMatchObject({ status: 404 })
    await host.refreshNow()
    expect(host.getWireState().authorityAvailable).toBe(true)
    expect(h.capabilities.every(value => value === WALLET_CAPABILITY_VERSION)).toBe(true)
    expect(h.store.database.prepare('SELECT COUNT(*) AS n FROM incense_wallet').get()!.n).toBe(0)
  })
})
