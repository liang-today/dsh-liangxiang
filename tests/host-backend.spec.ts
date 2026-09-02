/**
 * Host <-> Backend end to end over real HTTP: DSH usage observation becomes a
 * Token claim, the claim becomes authoritative incense, votes spend it
 * atomically, and the browser wire frame carries the backend's published
 * snapshot (never a locally invented ratio).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { openBackendStore } from '../src/backend/store.ts'
import { BackendClientError, createBackendClient, type BackendClient } from '../src/host/backend-client.ts'
import { BackendLiangService } from '../src/host/backend-service.ts'
import { generateCommunityKeypair, type CommunityKeypair } from '../src/host/community-keys.ts'
import { wireToViewState } from '../src/client/store.ts'
import { parseWireState } from '../src/shared/wire.ts'
import { createMutableClock, DAY_MS, FIXED_NOW } from './helpers/backend.ts'
import { parseV1HistoryResponse } from '../src/shared/index.ts'

const INSTALLATION = 'inst-e2e-000001'
const SESSION = 'session-e2e-1'

interface Stack {
  host: BackendLiangService
  backend: LiangxiangBackendService
  clock: ReturnType<typeof createMutableClock>
  stopNetwork: () => Promise<void>
  startNetwork: () => Promise<void>
  close: () => Promise<void>
}

let stack: Stack | null = null

/** Cumulative DSH `tokenUsage` projection value (four disjoint buckets). */
function usage(uncachedInput: number, cacheRead: number, cacheWrite: number, output: number): unknown {
  return {
    uncachedInputTokens: uncachedInput,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: output,
  }
}

/** Most integration cases exercise transport/accounting, not fallback rates. */
function observePro(
  host: BackendLiangService,
  sessionId: string,
  value: unknown,
  origin: Parameters<BackendLiangService['observeUsage']>[2],
): void {
  host.observeUsage(sessionId, value, origin, 'deepseek-v4-pro')
}

async function startStack(
  env: Record<string, string | undefined> = {},
  hostOptions: {
    claimDebounceMs?: number
    timezone?: string
    start?: number
    signedIdentity?: CommunityKeypair
    existingFingerprintOwner?: CommunityKeypair
  } = {},
): Promise<Stack> {
  const config = resolveBackendConfig(
    {
      LIANGXIANG_BACKEND_DB: ':memory:',
      LIANGXIANG_SNAPSHOT_SECONDS: '300',
      LIANGXIANG_MAX_TOKENS_PER_MINUTE: '0',
      LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0',
      ...env,
    },
    () => undefined,
  )
  const clock = createMutableClock(hostOptions.start ?? FIXED_NOW)
  const store = openBackendStore(config.databasePath)
  const backend = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
  if (hostOptions.existingFingerprintOwner !== undefined) {
    const owner = hostOptions.existingFingerprintOwner
    if (owner.deviceFingerprint === null) throw new Error('existing owner requires a fingerprint')
    store.upsertIdentity({
      installation_id: owner.installationId,
      public_key: owner.publicKey,
      device_fingerprint: owner.deviceFingerprint,
      created_at: clock.now(),
      last_seen_at: clock.now(),
    })
  }
  if (hostOptions.signedIdentity !== undefined) backend.issueAdmissionTickets(1)
  const api = createBackendHttpApi({
    service: backend,
    store,
    voteRateLimitPerMinute: 0,
    allowUnsigned: hostOptions.signedIdentity === undefined,
    log: () => undefined,
  })
  await new Promise<void>((resolve) => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  if (address === null || typeof address === 'string') throw new Error('backend did not bind a port')

  const identityRef = { current: hostOptions.signedIdentity ?? null }
  const host = new BackendLiangService({
    client: createBackendClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      signer: () => identityRef.current,
    }),
    timezone: hostOptions.timezone ?? config.timezone,
    clock,
    warn: () => undefined,
    claimDebounceMs: hostOptions.claimDebounceMs ?? 0,
    identityRef,
  })
  host.setAccountingAvailable(true)
  if (hostOptions.signedIdentity === undefined) host.attachIdentity(INSTALLATION)
  else host.attachCommunityIdentity(hostOptions.signedIdentity)
  await host.refreshBootstrap()

  stack = {
    host,
    backend,
    clock,
    stopNetwork: async () => {
      if (!api.server.listening) return
      await new Promise<void>((resolve) => api.server.close(() => resolve()))
    },
    startNetwork: async () => {
      if (api.server.listening) return
      await new Promise<void>((resolve) => api.server.listen(address.port, '127.0.0.1', resolve))
    },
    close: async () => {
      host.dispose()
      if (api.server.listening) {
        await new Promise<void>((resolve) => api.server.close(() => resolve()))
      }
      store.close()
    },
  }
  return stack
}

/** Poll until `predicate` holds (claims are debounced + asynchronous). */
async function waitFor(predicate: () => boolean, label: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${label}`)
}

function claimedOnBackend(s: Stack, tokens: number): boolean {
  return s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens === tokens
}

function frame(s: Stack) {
  // Parse through the browser boundary: the host must emit a valid wire frame.
  return parseWireState(JSON.parse(JSON.stringify(s.host.getWireState())) as unknown)
}

afterEach(async () => {
  await stack?.close()
  stack = null
})

describe('online bootstrap', () => {
  it('tries every ticket returned by the public list instead of stopping after five races', async () => {
    const identity = generateCommunityKeypair('host-ticket-list-device')
    const attempts: string[] = []
    const tickets = Array.from({ length: 6 }, (_unused, index) => ({
      ticket_id: `ticket_${String(index).padStart(16, '0')}`,
      secret: `LX-ticket-${index}`,
      remaining_claims: 1,
      expires_at: FIXED_NOW + 60_000,
    }))
    const client = {
      admissionTickets: async () => ({
        schema_version: 1,
        server_time: FIXED_NOW,
        available_claims: 6,
        tickets,
      }),
      claimAdmission: async (_installationId: string, secret: string) => {
        attempts.push(secret)
        if (attempts.length <= 5) {
          throw new BackendClientError('ticket raced', 409, 'admission_ticket_exhausted')
        }
        return {
          schema_version: 1,
          claimed: true,
          installation_id: identity.installationId,
          ticket_id: tickets[5]!.ticket_id,
          server_time: FIXED_NOW,
        }
      },
      dispose: () => undefined,
    } as unknown as BackendClient
    const identityRef = { current: identity }
    const host = new BackendLiangService({
      client,
      timezone: 'Asia/Shanghai',
      clock: createMutableClock(FIXED_NOW),
      identityRef,
    })
    await (host as unknown as { enrollWithPublicTicket(installationId: string): Promise<void> })
      .enrollWithPublicTicket(identity.installationId)
    expect(attempts).toHaveLength(6)
    expect(attempts.at(-1)).toBe(tickets[5]!.secret)
    host.dispose()
  })

  it('refreshes the public ticket list after a whole visible page loses its races', async () => {
    const identity = generateCommunityKeypair('host-ticket-refresh-device')
    const first = {
      ticket_id: 'ticket_0000000000000001',
      secret: 'LX-raced-page-ticket',
      remaining_claims: 1,
      expires_at: FIXED_NOW + 60_000,
    }
    const second = {
      ticket_id: 'ticket_0000000000000002',
      secret: 'LX-refreshed-ticket',
      remaining_claims: 1,
      expires_at: FIXED_NOW + 60_000,
    }
    let listReads = 0
    const attempts: string[] = []
    const client = {
      admissionTickets: async () => {
        listReads += 1
        return {
          schema_version: 1,
          server_time: FIXED_NOW,
          available_claims: 2,
          tickets: [listReads === 1 ? first : second],
        }
      },
      claimAdmission: async (_installationId: string, secret: string) => {
        attempts.push(secret)
        if (secret === first.secret) {
          throw new BackendClientError('ticket raced', 409, 'admission_ticket_exhausted')
        }
        return {
          schema_version: 1,
          claimed: true,
          installation_id: identity.installationId,
          ticket_id: second.ticket_id,
          server_time: FIXED_NOW,
        }
      },
      dispose: () => undefined,
    } as unknown as BackendClient
    const host = new BackendLiangService({
      client,
      timezone: 'Asia/Shanghai',
      clock: createMutableClock(FIXED_NOW),
      identityRef: { current: identity },
    })

    await (host as unknown as { enrollWithPublicTicket(installationId: string): Promise<void> })
      .enrollWithPublicTicket(identity.installationId)

    expect(listReads).toBe(2)
    expect(attempts).toEqual([first.secret, second.secret])
    host.dispose()
  })

  it('serves a connecting frame immediately while community bootstrap is still in flight', () => {
    const client = {
      baseUrl: 'http://127.0.0.1:9',
      bootstrap: () => new Promise(() => undefined),
      dispose: () => undefined,
    } as unknown as BackendClient
    const host = new BackendLiangService({
      client,
      timezone: 'Asia/Shanghai',
      clock: createMutableClock(FIXED_NOW),
      warn: () => undefined,
    })
    host.attachIdentity(INSTALLATION)
    expect(host.isReady).toBe(true)
    expect(host.hasCommunityAuthority).toBe(false)
    const wire = parseWireState(JSON.parse(JSON.stringify(host.getWireState())) as unknown)
    expect(wire.authorityAvailable).toBe(false)
    expect(wire.activeCase.id).toBe('connecting')
    expect(wire.authorityMode).toBe('DEV_STAGING_ONLY')
    host.dispose()
  })

  it('fails the first community contact in 3s and keeps serving the connecting frame', async () => {
    const client = createBackendClient({
      baseUrl: 'http://127.0.0.1:4180',
      fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      }),
    })
    const host = new BackendLiangService({
      client,
      timezone: 'Asia/Shanghai',
      clock: createMutableClock(FIXED_NOW),
      warn: () => undefined,
    })
    host.attachIdentity(INSTALLATION)
    const started = Date.now()
    await host.refreshBootstrap({ startup: true })
    expect(Date.now() - started).toBeLessThan(4_500)
    expect(host.isReady).toBe(true)
    expect(host.hasCommunityAuthority).toBe(false)
    expect(host.getWireState().authorityAvailable).toBe(false)
    host.dispose()
    client.dispose()
  }, 8_000)

  it('automatically fetches and consumes a public ticket on a signed first install', async () => {
    const identity = generateCommunityKeypair('host-admission-device')
    const s = await startStack({}, { signedIdentity: identity })
    expect(s.host.isReady).toBe(true)
    expect(s.host.installation).toBe(identity.installationId)
    expect(s.backend.admissionInventory().remainingClaims).toBe(0)
    expect(frame(s).authorityAvailable).toBe(true)
    expect(frame(s).authorityReason).toBeNull()
  })

  it('automatically re-keys a reinstalled device without consuming a public ticket', async () => {
    const oldIdentity = generateCommunityKeypair('host-reinstall-device')
    const newIdentity = generateCommunityKeypair('host-reinstall-device')
    const s = await startStack(
      { LIANGXIANG_REKEY_COOLDOWN_MS: '0' },
      { signedIdentity: newIdentity, existingFingerprintOwner: oldIdentity },
    )
    expect(s.host.isReady).toBe(true)
    expect(s.backend.admissionInventory().remainingClaims).toBe(1)
    expect(frame(s).authorityAvailable).toBe(true)
    expect(frame(s).authorityReason).toBeNull()
  })

  it('serves a DEV_STAGING_ONLY frame with the backend case and a waiting snapshot', async () => {
    const s = await startStack()
    expect(s.host.isReady).toBe(true)
    const wire = frame(s)
    expect(wire.authorityMode).toBe('DEV_STAGING_ONLY')
    expect(wire.businessDate).toBe('2026-08-16')
    expect(wire.activeCase.id).toBe('case-2026-08-16')
    expect(wire.global.sequence).toBe(1)
    expect(wire.personal.effectiveTokensToday).toBe(0)

    const view = wireToViewState(wire, 'live')
    expect(view.authorityMode).toBe('DEV_STAGING_ONLY')
    expect(view.snapshot.liangziState).toBe('waiting')
    expect(view.snapshot.upRatio).toBeNull()
    expect(view.personal.remainingIncense).toBe(0)
  })

  it('pushes an operator broadcast through the snapshot cadence and expires back to 梁小号', async () => {
    const s = await startStack()
    expect(frame(s).broadcast).toBeNull()
    const notice = s.backend.setBroadcast('QQ群 453683905 已开，来群里一起出梁案', 'important', 1)

    await s.host.refreshSnapshot()
    expect(frame(s).broadcast).toMatchObject({
      id: notice.id,
      level: 'important',
      message: 'QQ群 453683905 已开，来群里一起出梁案',
    })

    s.clock.advance(60 * 60 * 1000)
    await s.host.refreshSnapshot()
    expect(frame(s).broadcast).toBeNull()
  })

  it('keeps observing Token offline, disables authority, and recovers automatically on the next tick', async () => {
    const s = await startStack({}, { claimDebounceMs: 60_000 })
    expect(frame(s).authorityAvailable).toBe(true)
    await s.stopNetwork()
    await s.host.refreshSnapshot()
    expect(frame(s).authorityAvailable).toBe(false)

    observePro(s.host, SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    const offline = wireToViewState(frame(s), 'live')
    expect(offline.observedEarnedIncenseToday).toBe(1)
    expect(offline.personal.remainingIncense).toBe(0)
    await expect(s.host.vote({
      caseId: offline.activeCase.id,
      voteType: 'up',
      requestId: 'req-offline-0001',
    })).rejects.toThrow('temporarily unavailable')

    await s.startNetwork()
    await new Promise((resolve) => setTimeout(resolve, 1_050))
    await s.host.refreshBootstrap()
    expect(frame(s).authorityAvailable).toBe(true)
  })

  it('paints and claims usage when the host TZ date disagrees with the backend', async () => {
    // 22:00 UTC 16 Aug is already 17 Aug in Asia/Shanghai. A UTC-configured
    // host used to bucket tokens under the 16th while the panel read the 17th.
    const s = await startStack({}, {
      claimDebounceMs: 0,
      timezone: 'UTC',
      start: Date.UTC(2026, 7, 16, 22, 0, 0),
    })
    expect(s.backend.businessDate()).toBe('2026-08-17')
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    expect(frame(s).personal.effectiveTokensToday).toBe(50_000)
    await waitFor(() => claimedOnBackend(s, 50_000), 'the claim to land on the backend date')
  })

  it('paints local incense immediately, without waiting for the remote claim', async () => {
    const s = await startStack({}, { claimDebounceMs: 60_000 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(10_000, 20_000, 5_000, 15_000), { kind: 'live', firstLiveSeq: 0 })
    const wire = frame(s)
    expect(wire.personal.effectiveTokensToday).toBe(50_000)
    expect(wire.accounting.inputTokensToday).toBe(35_000)
    const view = wireToViewState(wire, 'live')
    // Ring progress is optimistic (painted immediately); spendable incense is
    // authoritative and stays 0 until the debounced claim lands.
    expect(view.personal.tokensToNextIncense).toBe(50_000)
    expect(view.personal.remainingIncense).toBe(0)
  })

  it('lowers tokensToNextIncense as live usage arrives, without waiting for the claim', async () => {
    const s = await startStack({}, { claimDebounceMs: 60_000 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(10_000, 0, 0, 6_600), { kind: 'live', firstLiveSeq: 0 })
    const before = wireToViewState(frame(s), 'live').personal
    expect(before.effectiveTokensToday).toBe(16_600)
    expect(before.tokensToNextIncense).toBe(33_400)
    observePro(s.host, SESSION, usage(10_000, 0, 0, 6_900), { kind: 'live', firstLiveSeq: 0 })
    const after = wireToViewState(frame(s), 'live').personal
    expect(after.effectiveTokensToday).toBe(16_900)
    expect(after.tokensToNextIncense).toBe(33_100)
    expect(after.liangQiFill).toBeGreaterThan(before.liangQiFill)
  })

  it('repair-only reconciliation drops inflated local observation so the panel follows the server ledger', async () => {
    const s = await startStack({}, { claimDebounceMs: 60_000 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(200_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    expect(frame(s).personal.effectiveTokensToday).toBe(200_000)
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(0)
    await s.host.reconcileNow()
    expect(frame(s).personal.effectiveTokensToday).toBe(0)
    expect(wireToViewState(frame(s), 'live').personal.remainingIncense).toBe(0)
  })

  it('keeps painting new tokens after repair reconciliation when the server claim is ahead', async () => {
    const s = await startStack({}, { claimDebounceMs: 0 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 50_000), 'the first stick to be claimed')
    await s.host.reconcileNow()
    expect(frame(s).personal.effectiveTokensToday).toBe(50_000)
    observePro(s.host, SESSION, usage(50_000, 0, 0, 3_000), { kind: 'live', firstLiveSeq: 0 })
    const view = wireToViewState(frame(s), 'live')
    expect(view.personal.effectiveTokensToday).toBe(53_000)
    expect(view.personal.tokensToNextIncense).toBe(47_000)
    expect(view.personal.remainingIncense).toBe(1)
  })

  it('claims the local suffix on top of the server ledger after repair reconciliation', async () => {
    const s = await startStack({}, { claimDebounceMs: 0 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 50_000), 'the first stick to be claimed')
    await s.host.reconcileNow()
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(50_000)
    // Same session: watermarks keep the original 50k from being dumped again.
    // New output is a suffix that must raise the ledger, not replace it.
    observePro(s.host, SESSION, usage(50_000, 0, 0, 50_000), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 100_000), 'the post-reconcile suffix to raise the ledger')
    expect(wireToViewState(frame(s), 'live').personal.remainingIncense).toBe(2)
  })

  it('can vote with incense earned after repair reconciliation reset the local daily total', async () => {
    const s = await startStack({}, { claimDebounceMs: 0 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 50_000), 'the first stick to be claimed')
    const caseId = frame(s).activeCase.id
    const spent = await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-spent01' })
    expect(spent.result.status).toBe('accepted')
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.remaining_incense).toBe(0)
    await s.host.reconcileNow()
    observePro(s.host, SESSION, usage(50_000, 0, 0, 50_000), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(
      () => s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens === 100_000,
      'the new stick to land after repair reconciliation',
    )
    const again = await s.host.vote({ caseId, voteType: 'down', requestId: 'req-e2e-spent02' })
    expect(again.result.status).toBe('accepted')
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.remaining_incense).toBe(0)
  })

  it('does not re-add the local daily total when the server ledger is already ahead', async () => {
    const s = await startStack({}, { claimDebounceMs: 0 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 50_000), 'the first stick to be claimed')
    // Another host (or tab) raised the shared ledger to 200k out of band.
    s.backend.applyTokenClaim(INSTALLATION, {
      claimed_effective_tokens: 200_000,
      claim_business_date: s.backend.dailyState(INSTALLATION).business_date,
    })
    // Re-bootstrap re-reads the ledger and re-baselines the local daily total.
    // The local 50k is already inside the 200k ledger and must not be added
    // on top (that would double-count it to 250k).
    await s.host.refreshBootstrap()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(200_000)
  })

  it('does not re-claim a catch-up session after a stale persist hydrate', async () => {
    const s = await startStack({}, { claimDebounceMs: 0 })
    const alreadyThere = usage(2_000_000, 0, 0, 150_000)
    observePro(s.host, SESSION, alreadyThere, { kind: 'catchup' })
    s.host.hydrateUsage(
      new Map([[SESSION, { inputHwm: 50_000, outputHwm: 0 }]]),
      new Map(),
      { putWatermark: () => undefined, putDailyUsage: () => undefined, deleteDailyUsage: () => undefined },
    )
    observePro(s.host, SESSION, alreadyThere, { kind: 'live', firstLiveSeq: 0 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(0)
    expect(frame(s).personal.effectiveTokensToday).toBe(0)
  })

  it('turns observed DSH usage into an authoritative claim (input+output, all buckets)', async () => {
    const s = await startStack()
    // 10k uncached + 20k cacheRead + 5k cacheWrite = 35k input; +15k output = 50k.
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(10_000, 20_000, 5_000, 15_000), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 50_000), 'the claim to be recorded')

    const wire = frame(s)
    expect(wire.accounting.inputTokensToday).toBe(35_000)
    expect(wire.accounting.outputTokensToday).toBe(15_000)
    const view = wireToViewState(wire, 'live')
    expect(view.personal.earnedIncenseToday).toBe(1)
    expect(view.personal.remainingIncense).toBe(1)
  })
})

describe('online voting', () => {
  async function stackWithIncense(count: number, extraTokens = 0): Promise<Stack> {
    const s = await startStack()
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(count * 50_000 + extraTokens, 0, 0, 0), {
      kind: 'live',
      firstLiveSeq: 0,
    })
    await waitFor(
      () => claimedOnBackend(s, count * 50_000 + extraTokens),
      'the claim to be recorded',
    )
    return s
  }

  it('spends one incense and shows the new 梁位 on the same click', async () => {
    const s = await stackWithIncense(3, 47_000)
    const caseId = frame(s).activeCase.id
    const before = wireToViewState(frame(s), 'live')
    expect(before.personal.remainingIncense).toBe(3)
    expect(before.snapshot.liangziState).toBe('waiting')

    const outcome = await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-000001' })
    expect(outcome.result.status).toBe('accepted')
    const after = wireToViewState(frame(s), 'live')
    expect(after.personal.remainingIncense).toBe(2)
    // Ring fill (token progress) is untouched by spending.
    expect(after.personal.tokenRemainder).toBe(before.personal.tokenRemainder)
    // No extra round trip and no cadence wait: the vote's own snapshot is here.
    expect(after.snapshot.sequence).toBe(before.snapshot.sequence + 1)
    expect(after.snapshot.upVotes).toBe(1)
    expect(after.snapshot.uniqueVoters).toBe(1)
    expect(after.snapshot.liangziState).toBe('liang_zu')
  })

  it('is idempotent across a retry of the same request id', async () => {
    const s = await stackWithIncense(2)
    const caseId = frame(s).activeCase.id
    const first = await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-retry01' })
    const retry = await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-retry01' })
    expect(first.result.status).toBe('accepted')
    expect(retry.result.status).toBe('accepted')
    expect(frame(s).personal.usedIncenseToday).toBe(1)
    expect(wireToViewState(frame(s), 'live').personal.remainingIncense).toBe(1)
  })

  it('rejects a conflicting reuse of one request id', async () => {
    const s = await stackWithIncense(2)
    const caseId = frame(s).activeCase.id
    await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-conflic' })
    const conflict = await s.host.vote({ caseId, voteType: 'down', requestId: 'req-e2e-conflic' })
    expect(conflict.result).toMatchObject({ status: 'rejected', reason: 'idempotency_conflict' })
    expect(frame(s).personal.usedIncenseToday).toBe(1)
  })

  it('stops at the authoritative balance, not at a browser-side count', async () => {
    const s = await stackWithIncense(2)
    const caseId = frame(s).activeCase.id
    await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-spend01' })
    await s.host.vote({ caseId, voteType: 'down', requestId: 'req-e2e-spend02' })
    const denied = await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-spend03' })
    expect(denied.result).toMatchObject({ status: 'rejected', reason: 'insufficient_incense' })
    expect(wireToViewState(frame(s), 'live').personal.remainingIncense).toBe(0)
  })

  it('picks up an out-of-band balance change on the cadence', async () => {
    const s = await stackWithIncense(1)
    expect(frame(s).personal.effectiveTokensToday).toBe(50_000)
    // Someone else raised the claim for this installation (another tab/host).
    s.backend.applyTokenClaim(INSTALLATION, {
      claimed_effective_tokens: 200_000,
      claim_business_date: s.backend.businessDate(),
    })
    // The snapshot poll alone must not leave the panel on a stale balance.
    for (let i = 0; i < 5; i += 1) s.host.tick()
    await waitFor(() => frame(s).personal.effectiveTokensToday === 200_000, 'the balance to converge')
    expect(wireToViewState(frame(s), 'live').personal.remainingIncense).toBe(4)
  })

  it('converges two independent host-side callers on one authoritative pool', async () => {
    const s = await stackWithIncense(1)
    const caseId = frame(s).activeCase.id
    // Two tabs reach the same host and therefore the same backend ledger.
    const [a, b] = await Promise.all([
      s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-tab-a01' }),
      s.host.vote({ caseId, voteType: 'down', requestId: 'req-e2e-tab-b01' }),
    ])
    const accepted = [a, b].filter((outcome) => outcome.result.status === 'accepted')
    expect(accepted).toHaveLength(1)
    expect(frame(s).personal.usedIncenseToday).toBe(1)
  })

  it('flushes a pending debounced claim before the vote is evaluated', async () => {
    const s = await startStack({}, { claimDebounceMs: 60_000 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    // The panel already paints 1 炷 from local observation, but the claim is
    // debounced for a minute and has NOT reached the backend yet.
    expect(wireToViewState(frame(s), 'live').personal.effectiveTokensToday).toBe(50_000)
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(0)

    const caseId = frame(s).activeCase.id
    const outcome = await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-flush01' })
    expect(outcome.result.status).toBe('accepted')
    // The vote flushed the claim first, so the backend recorded it.
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(50_000)
  })
})

describe('online rollover', () => {
  it('caches one full 梁祠 archive and switches to immutable deltas after rollover', async () => {
    const s = await startStack()
    const initial = parseV1HistoryResponse(await s.host.history())
    expect(initial).toMatchObject({ full: true, archiveVersion: 0, days: [] })

    observePro(s.host, SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 50_000), 'history test claim')
    const caseId = frame(s).activeCase.id
    await s.host.vote({ caseId, voteType: 'up', requestId: 'req-history-e2e1' })

    s.clock.advance(DAY_MS)
    await s.host.refreshSnapshot()
    const delta = parseV1HistoryResponse(await s.host.history(0))
    expect(delta).toMatchObject({ full: false, archiveVersion: 1 })
    expect(delta.days[0]).toMatchObject({
      businessDate: '2026-08-16',
      upVotes: 1,
      downVotes: 0,
      liangziState: 'liang_zu',
    })
    expect(frame(s).archiveVersion).toBe(1)
  })

  it('adopts the backend business date and starts the new day clean', async () => {
    const s = await startStack()
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(100_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 100_000), 'the claim to be recorded')
    const yesterday = frame(s)
    await s.host.vote({ caseId: yesterday.activeCase.id, voteType: 'up', requestId: 'req-e2e-day1-01' })

    s.clock.advance(DAY_MS)
    await s.host.refreshSnapshot()
    const today = frame(s)
    expect(today.businessDate).toBe('2026-08-17')
    expect(today.activeCase.id).toBe('case-2026-08-17')
    expect(today.personal.effectiveTokensToday).toBe(0)
    expect(today.personal.usedIncenseToday).toBe(0)
    const view = wireToViewState(today, 'live')
    expect(view.snapshot.liangziState).toBe('waiting')
    expect(view.snapshot.totalIncense).toBe(0)

    // Yesterday's case id is no longer votable.
    const stale = await s.host.vote({
      caseId: yesterday.activeCase.id,
      voteType: 'up',
      requestId: 'req-e2e-stale01',
    })
    expect(stale.result.status).toBe('rejected')
  })

  it('resets the claim watermark on rollover so a small new-day claim is not skipped', async () => {
    const s = await startStack({}, { claimDebounceMs: 0 })
    observePro(s.host, SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    observePro(s.host, SESSION, usage(6_000_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 6_000_000), 'day-1 claim to land')

    // Roll over. The host still holds day-1's watermark (6M) and business date.
    s.clock.advance(DAY_MS)

    // First new-day observation: the host submits for the stale day, the
    // backend reports the new day, and the host must reset its watermark.
    observePro(s.host, SESSION, usage(6_001_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => frame(s).businessDate === '2026-08-17', 'host to adopt day 2')

    // A second small delta must NOT be skipped by day-1's 6M watermark.
    observePro(s.host, SESSION, usage(6_002_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 1_000), 'day-2 claim to land')
  })

  it('picks up a published case on the existing snapshot poll', async () => {
    const s = await startStack()
    const previous = frame(s)
    s.backend.publishCase('Host 应在一秒内看到的新案')
    await s.host.refreshSnapshot()
    const next = frame(s)
    expect(next.activeCase.id).not.toBe(previous.activeCase.id)
    expect(next.activeCase.title).toBe('Host 应在一秒内看到的新案')
    expect(next.global.upVotes).toBe(0)
    expect(next.global.downVotes).toBe(0)
    expect(wireToViewState(next, 'live').snapshot.liangziState).toBe('waiting')
  })

  it('refreshNow re-bootstraps without waiting for the next tick', async () => {
    const s = await startStack()
    s.backend.publishCase('悬停应立刻看到')
    await s.host.refreshNow()
    expect(frame(s).activeCase.title).toBe('悬停应立刻看到')
  })
})
