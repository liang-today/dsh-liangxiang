/**
 * Host <-> Backend end to end over real HTTP: DSH usage observation becomes a
 * Token claim, the claim becomes authoritative incense, votes spend it
 * atomically, and the browser wire frame carries the backend's published
 * snapshot (never a locally invented ratio).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { LiangbiaoBackendService } from '../src/backend/service.ts'
import { openBackendStore } from '../src/backend/store.ts'
import { createBackendClient } from '../src/host/backend-client.ts'
import { BackendLiangService } from '../src/host/backend-service.ts'
import { wireToViewState } from '../src/client/store.ts'
import { parseWireState } from '../src/shared/wire.ts'
import { createMutableClock, DAY_MS, FIXED_NOW } from './helpers/backend.ts'

const INSTALLATION = 'inst-e2e-000001'
const SESSION = 'session-e2e-1'

interface Stack {
  host: BackendLiangService
  backend: LiangbiaoBackendService
  clock: ReturnType<typeof createMutableClock>
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

async function startStack(
  env: Record<string, string | undefined> = {},
  hostOptions: { claimDebounceMs?: number, timezone?: string, start?: number } = {},
): Promise<Stack> {
  const config = resolveBackendConfig(
    {
      LIANGBIAO_BACKEND_DB: ':memory:',
      LIANGBIAO_SNAPSHOT_SECONDS: '300',
      LIANGBIAO_MAX_TOKENS_PER_MINUTE: '0',
      ...env,
    },
    () => undefined,
  )
  const clock = createMutableClock(hostOptions.start ?? FIXED_NOW)
  const store = openBackendStore(config.databasePath)
  const backend = new LiangbiaoBackendService({ store, config, clock, warn: () => undefined })
  const api = createBackendHttpApi({
    service: backend,
    store,
    voteRateLimitPerMinute: 0,
    allowUnsigned: true,
    log: () => undefined,
  })
  await new Promise<void>((resolve) => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  if (address === null || typeof address === 'string') throw new Error('backend did not bind a port')

  const host = new BackendLiangService({
    client: createBackendClient({ baseUrl: `http://127.0.0.1:${address.port}` }),
    timezone: hostOptions.timezone ?? config.timezone,
    clock,
    warn: () => undefined,
    claimDebounceMs: hostOptions.claimDebounceMs ?? 0,
  })
  host.setAccountingAvailable(true)
  host.attachIdentity(INSTALLATION)
  await host.refreshBootstrap()

  stack = {
    host,
    backend,
    clock,
    close: async () => {
      host.dispose()
      await new Promise<void>((resolve) => api.server.close(() => resolve()))
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

  it('paints and claims usage when the host TZ date disagrees with the backend', async () => {
    // 22:00 UTC 16 Aug is already 17 Aug in Asia/Shanghai. A UTC-configured
    // host used to bucket tokens under the 16th while the panel read the 17th.
    const s = await startStack({}, {
      claimDebounceMs: 0,
      timezone: 'UTC',
      start: Date.UTC(2026, 7, 16, 22, 0, 0),
    })
    expect(s.backend.businessDate()).toBe('2026-08-17')
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    expect(frame(s).personal.effectiveTokensToday).toBe(50_000)
    expect(wireToViewState(frame(s), 'live').personal.remainingIncense).toBe(1)
    await waitFor(() => claimedOnBackend(s, 50_000), 'the claim to land on the backend date')
  })

  it('paints local incense immediately, without waiting for the remote claim', async () => {
    const s = await startStack({}, { claimDebounceMs: 60_000 })
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(10_000, 20_000, 5_000, 15_000), { kind: 'live', firstLiveSeq: 0 })
    const wire = frame(s)
    expect(wire.personal.effectiveTokensToday).toBe(50_000)
    expect(wire.accounting.inputTokensToday).toBe(35_000)
    const view = wireToViewState(wire, 'live')
    expect(view.personal.earnedIncenseToday).toBe(1)
    expect(view.personal.remainingIncense).toBe(1)
    expect(view.personal.tokensToNextIncense).toBe(50_000)
  })

  it('lowers tokensToNextIncense as live usage arrives, without waiting for the claim', async () => {
    const s = await startStack({}, { claimDebounceMs: 60_000 })
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(10_000, 0, 0, 6_600), { kind: 'live', firstLiveSeq: 0 })
    const before = wireToViewState(frame(s), 'live').personal
    expect(before.effectiveTokensToday).toBe(16_600)
    expect(before.tokensToNextIncense).toBe(33_400)
    s.host.observeUsage(SESSION, usage(10_000, 0, 0, 6_900), { kind: 'live', firstLiveSeq: 0 })
    const after = wireToViewState(frame(s), 'live').personal
    expect(after.effectiveTokensToday).toBe(16_900)
    expect(after.tokensToNextIncense).toBe(33_100)
    expect(after.liangQiFill).toBeGreaterThan(before.liangQiFill)
  })

  it('上达天听 drops inflated local observation so the panel follows the server ledger', async () => {
    const s = await startStack({}, { claimDebounceMs: 60_000 })
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(200_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    expect(frame(s).personal.effectiveTokensToday).toBe(200_000)
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(0)
    await s.host.reconcileNow()
    expect(frame(s).personal.effectiveTokensToday).toBe(0)
    expect(wireToViewState(frame(s), 'live').personal.remainingIncense).toBe(0)
  })

  it('keeps painting new tokens after 上达天听 when the server claim is ahead', async () => {
    const s = await startStack({}, { claimDebounceMs: 0 })
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    await waitFor(() => claimedOnBackend(s, 50_000), 'the first stick to be claimed')
    await s.host.reconcileNow()
    expect(frame(s).personal.effectiveTokensToday).toBe(50_000)
    s.host.observeUsage(SESSION, usage(50_000, 0, 0, 3_000), { kind: 'live', firstLiveSeq: 0 })
    const view = wireToViewState(frame(s), 'live')
    expect(view.personal.effectiveTokensToday).toBe(53_000)
    expect(view.personal.tokensToNextIncense).toBe(47_000)
    expect(view.personal.remainingIncense).toBe(1)
  })

  it('turns observed DSH usage into an authoritative claim (input+output, all buckets)', async () => {
    const s = await startStack()
    // 10k uncached + 20k cacheRead + 5k cacheWrite = 35k input; +15k output = 50k.
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(10_000, 20_000, 5_000, 15_000), { kind: 'live', firstLiveSeq: 0 })
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
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(count * 50_000 + extraTokens, 0, 0, 0), {
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
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(50_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    // The panel already paints 1 炷 from local observation, but the claim is
    // debounced for a minute and has NOT reached the backend yet.
    expect(wireToViewState(frame(s), 'live').personal.remainingIncense).toBe(1)
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(0)

    const caseId = frame(s).activeCase.id
    const outcome = await s.host.vote({ caseId, voteType: 'up', requestId: 'req-e2e-flush01' })
    expect(outcome.result.status).toBe('accepted')
    // The vote flushed the claim first, so the backend recorded it.
    expect(s.backend.dailyState(INSTALLATION).authoritative_personal_state.claimed_effective_tokens).toBe(50_000)
  })
})

describe('online rollover', () => {
  it('adopts the backend business date and starts the new day clean', async () => {
    const s = await startStack()
    s.host.observeUsage(SESSION, usage(0, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
    s.host.observeUsage(SESSION, usage(100_000, 0, 0, 0), { kind: 'live', firstLiveSeq: 0 })
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
