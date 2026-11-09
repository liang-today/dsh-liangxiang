import { afterEach, describe, expect, it } from 'vitest'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { openBackendStore } from '../src/backend/store.ts'
import { createBackendClient } from '../src/host/backend-client.ts'
import { LEGACY_LIANGZI_POLICY_VERSION, LIANGZI_POLICY_VERSION } from '../src/domain/index.ts'
import { INSTALLATION_HEADER, LIANGZI_POLICY_HEADER, WALLET_CAPABILITY_HEADER, WALLET_CAPABILITY_VERSION } from '../src/shared/backend-v1.ts'
import { parseV1HistoryResponse } from '../src/shared/history-v1.ts'

const installation = 'install-policy-upgrade'
const closers: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const close of closers.splice(0).reverse()) await close() })

async function harness(legacyCase = false) {
  let now = Date.parse('2026-10-18T04:00:00Z')
  const config = resolveBackendConfig({
    LIANGXIANG_BACKEND_DB: ':memory:', LIANGXIANG_BACKEND_PORT: '0',
    LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0', LIANGXIANG_MAX_TOKENS_PER_MINUTE: '0',
  }, () => undefined)
  const store = openBackendStore(':memory:')
  closers.push(() => store.close())
  if (legacyCase) store.insertCase({
    id: 'legacy-case', businessDate: '2026-10-18', title: '旧规则梁案', tokenPerIncense: 50_000,
    liangziPolicyVersion: LEGACY_LIANGZI_POLICY_VERSION, now,
  })
  const service = new LiangxiangBackendService({ store, config, clock: { now: () => now }, warn: () => undefined })
  const api = createBackendHttpApi({ store, service, voteRateLimitPerMinute: 0, allowUnsigned: true, log: () => undefined })
  await new Promise<void>(resolve => api.server.listen(0, '127.0.0.1', resolve))
  closers.push(async () => { await new Promise<void>(resolve => api.server.close(() => resolve())); api.reset() })
  const address = api.server.address()
  if (address === null || typeof address === 'string') throw new Error('no bound port')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const client = createBackendClient({ baseUrl })
  closers.push(() => client.dispose())
  return { service, store, client, baseUrl, setDate(date: string) { now = Date.parse(`${date}T04:00:00Z`) } }
}

describe('Liangzi policy rolling upgrade', () => {
  it('serves new and legacy clients the same accepted votes and replay receipt in their own vocabulary', async () => {
    const h = await harness()
    const bootstrap = await h.client.bootstrap(installation)
    expect(bootstrap.liangzi_policy.boundaries).toEqual([0.25, 0.5, 0.7, 0.85, 0.95])
    await h.client.submitClaim(installation, 500_000, bootstrap.business_date)
    const intent = { case_id: bootstrap.active_case.id, vote_type: 'down' as const, request_id: 'policy-vote-0001' }
    const accepted = await h.client.vote(installation, intent)
    expect(accepted.result.status).toBe('accepted')
    expect(accepted.global_snapshot.liangzi_state).toBe('xiao_nan_liang')

    const oldBootstrap = await fetch(`${h.baseUrl}/v1/bootstrap`, { headers: { [INSTALLATION_HEADER]: installation, [WALLET_CAPABILITY_HEADER]: WALLET_CAPABILITY_VERSION } }).then(r => r.json())
    expect(oldBootstrap.liangzi_policy).toEqual({ version: LEGACY_LIANGZI_POLICY_VERSION, boundaries: [0.5, 0.7, 0.85, 0.95] })
    expect(oldBootstrap.global_snapshot).toMatchObject({
      liangzi_state: 'liang_gong', down_votes: 1, sequence: accepted.global_snapshot.sequence,
      policy_version: LEGACY_LIANGZI_POLICY_VERSION,
    })
    // Cosmetic Liangzi policy negotiation is independent of wallet capability.
    expect(oldBootstrap.authoritative_personal_state).toEqual(accepted.authoritative_personal_state)
    const replay = await fetch(`${h.baseUrl}/v1/votes`, {
      method: 'POST', headers: { [INSTALLATION_HEADER]: installation, [WALLET_CAPABILITY_HEADER]: WALLET_CAPABILITY_VERSION, 'content-type': 'application/json' }, body: JSON.stringify(intent),
    }).then(r => r.json())
    expect(replay.result).toMatchObject({ status: 'accepted', replayed: true, spent_incense: 0 })
    expect(replay.global_snapshot.liangzi_state).toBe('liang_gong')
    expect(replay.authoritative_personal_state.remaining_incense).toBe(accepted.authoritative_personal_state.remaining_incense)
    expect((await h.client.snapshot()).global_snapshot).toMatchObject({ liangzi_state: 'xiao_nan_liang', down_votes: 1 })
  })

  it('keeps an existing case on its opening rule, enables six tiers on rollover and seals both archive versions', async () => {
    const h = await harness(true)
    expect((await h.client.bootstrap(installation)).liangzi_policy.boundaries).toEqual([0.5, 0.7, 0.85, 0.95])
    const voteDown = (requestId: string) => {
      const boot = h.service.bootstrap(installation)
      h.service.applyTokenClaim(installation, { claimed_effective_tokens: 500_000, claim_business_date: boot.business_date })
      return h.service.vote(installation, { case_id: boot.active_case.id, vote_type: 'down', request_id: requestId })
    }
    expect(voteDown('legacy-vote-0001').global_snapshot).toMatchObject({ liangzi_state: 'liang_gong', policy_version: LEGACY_LIANGZI_POLICY_VERSION })
    h.setDate('2026-10-19')
    expect(voteDown('current-vote-0001').global_snapshot).toMatchObject({ liangzi_state: 'xiao_nan_liang', policy_version: LIANGZI_POLICY_VERSION })
    h.setDate('2026-11-01')
    const history = await h.client.history()
    expect(history.days.find(d => d.businessDate === '2026-10-18')).toMatchObject({ liangziState: 'liang_gong', liangziPolicyVersion: LEGACY_LIANGZI_POLICY_VERSION })
    expect(history.days.find(d => d.businessDate === '2026-10-19')).toMatchObject({ liangziState: 'xiao_nan_liang', liangziPolicyVersion: LIANGZI_POLICY_VERSION })
    expect(history.weeks.find(w => w.weekId === '2026-W42')).toMatchObject({ liangziState: 'liang_gong', liangziPolicyVersion: LEGACY_LIANGZI_POLICY_VERSION })
    expect(history.weeks.find(w => w.weekId === '2026-W43')).toMatchObject({ liangziState: 'xiao_nan_liang', liangziPolicyVersion: LIANGZI_POLICY_VERSION })
    expect(history.months[0]).toMatchObject({ upVotes: 0, downVotes: 2, liangziState: 'xiao_nan_liang', liangziPolicyVersion: LIANGZI_POLICY_VERSION })
    const rowsBefore = h.store.dayArchives()
    const legacyResponse = await fetch(`${h.baseUrl}/v1/history`).then(r => r.json())
    const legacyHistory = parseV1HistoryResponse(legacyResponse)
    expect(legacyHistory.days.every(d => d.liangziState === 'liang_gong')).toBe(true)
    expect(h.store.dayArchives()).toEqual(rowsBefore)
    expect((await h.client.history()).days).toEqual(history.days)
    const currentResponse = await fetch(`${h.baseUrl}/v1/history`, { headers: { [LIANGZI_POLICY_HEADER]: LIANGZI_POLICY_VERSION } }).then(r => r.json())
    currentResponse.days[0].liangzi_policy_version = 'unknown-future-rule'
    expect(() => parseV1HistoryResponse(currentResponse)).toThrow(/unsupported Liangzi policy/)
  })
})
