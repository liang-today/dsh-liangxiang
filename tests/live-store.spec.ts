/**
 * Live store behavior over a fake transport: bootstrap, stale-frame
 * dropping, vote retry with the SAME request id, bounded SSE failure ->
 * offline, manual refresh reconnect.
 */
import { describe, expect, it } from 'vitest'
import { createLiveLiangxiangStore, type LiveStoreTransport } from '../src/client/live-store.ts'
import { FakeAuthoritativeLiangService, type LiangServiceConfig } from '../src/host/fake-service.ts'
import type { LiangxiangWireState } from '../src/shared/wire.ts'

const CONFIG: LiangServiceConfig = {
  timezone: 'Asia/Shanghai',
  tokenPerIncense: 50_000,
  snapshotRefreshSeconds: 300,
  seed: 'demo',
  caseTitle: 'DeepSeek Harness 是夯还是拉',
}

function makeService(clock: { now(): number } = { now: () => Date.UTC(2026, 7, 16, 4) }): FakeAuthoritativeLiangService {
  const service = new FakeAuthoritativeLiangService(CONFIG, clock, () => undefined)
  service.markReadyMemoryOnly('test')
  service.observeUsage('s1', {
    uncachedInputTokens: 397_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  }, { kind: 'live', firstLiveSeq: 0 }, 'deepseek-v4-pro')
  return service
}

interface FakeTransportControls {
  transport: LiveStoreTransport
  pushFrame(state: LiangxiangWireState): void
  emitSseError(): void
  requests: Array<{ path: string, body: string | undefined, headers: Record<string, string> | undefined }>
  failNextFetches(count: number): void
  streamsOpened: number
  transportDisposals: number
}

function fakeTransport(service: FakeAuthoritativeLiangService): FakeTransportControls {
  let handlers: { onFrame(data: string): void, onError(): void } | null = null
  let failCount = 0
  let requestCounter = 0
  const controls: FakeTransportControls = {
    requests: [],
    streamsOpened: 0,
    transportDisposals: 0,
    transport: {
      fetchJson(path, init) {
        controls.requests.push({ path, body: init?.body, headers: init?.headers })
        if (failCount > 0) {
          failCount -= 1
          return Promise.reject(new Error('network down'))
        }
        if (path === '/liangxiang/api/state') {
          return Promise.resolve(JSON.parse(JSON.stringify(service.getWireState())) as unknown)
        }
        if (path === '/liangxiang/api/refresh') {
          service.refreshNow()
          return Promise.resolve(JSON.parse(JSON.stringify(service.getWireState())) as unknown)
        }
        if (path === '/liangxiang/api/reconcile') {
          service.reconcileNow()
          return Promise.resolve(JSON.parse(JSON.stringify(service.getWireState())) as unknown)
        }
        if (path === '/liangxiang/api/history') {
          return Promise.resolve(JSON.parse(JSON.stringify(service.history())) as unknown)
        }
        if (path.startsWith('/liangxiang/api/history?after_version=')) {
          const cursor = Number(new URL(path, 'http://local').searchParams.get('after_version'))
          return Promise.resolve(JSON.parse(JSON.stringify(service.history(cursor))) as unknown)
        }
        if (path === '/liangxiang/api/mode') {
          return Promise.resolve(JSON.parse(JSON.stringify(service.getWireState())) as unknown)
        }
        if (path === '/liangxiang/api/vote') {
          const intent = JSON.parse(init?.body ?? '{}') as { caseId: string, voteType: 'up' | 'down', requestId: string }
          const outcome = service.vote(intent)
          return Promise.resolve(JSON.parse(JSON.stringify({
            schemaVersion: 1,
            result: outcome.result,
            state: outcome.state,
          })) as unknown)
        }
        return Promise.reject(new Error(`unexpected path ${path}`))
      },
      openEvents(_path, streamHandlers) {
        controls.streamsOpened += 1
        handlers = streamHandlers
        return { close: () => { handlers = null } }
      },
      randomRequestId() {
        requestCounter += 1
        return `req-test-${String(requestCounter).padStart(4, '0')}`
      },
      dispose() {
        controls.transportDisposals += 1
      },
    },
    pushFrame(state) {
      handlers?.onFrame(JSON.stringify(state))
    },
    emitSseError() {
      handlers?.onError()
    },
    failNextFetches(count) {
      failCount = count
    },
  }
  return controls
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('live store', () => {
  it('disposes its transport exactly once', () => {
    const controls = fakeTransport(makeService())
    const store = createLiveLiangxiangStore(controls.transport)
    store.dispose()
    store.dispose()
    expect(controls.transportDisposals).toBe(1)
  })

  it('loads history once, then requests only an archive-version delta after rollover', async () => {
    let now = Date.UTC(2026, 7, 16, 4)
    const service = makeService({ now: () => now })
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    expect(store.getHistorySnapshot()).toMatchObject({ status: 'ready', archive: { archiveVersion: 0 } })
    expect(controls.requests.filter(request => request.path === '/liangxiang/api/history')).toHaveLength(1)

    now = Date.UTC(2026, 7, 17, 4)
    controls.pushFrame(service.getWireState())
    await settled()
    const history = store.getHistorySnapshot()
    expect(history).toMatchObject({ status: 'ready', archive: { archiveVersion: 1 } })
    expect(history.archive?.days[0]).toMatchObject({ businessDate: '2026-08-16' })
    expect(controls.requests.some(request => request.path === '/liangxiang/api/history?after_version=0')).toBe(true)
    store.dispose()
  })

  it('keeps last-known-good history and marks it stale on a failed delta', async () => {
    let now = Date.UTC(2026, 7, 16, 4)
    const service = makeService({ now: () => now })
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    now = Date.UTC(2026, 7, 17, 4)
    controls.failNextFetches(1)
    controls.pushFrame(service.getWireState())
    await settled()
    expect(store.getHistorySnapshot()).toMatchObject({
      status: 'stale',
      archive: { archiveVersion: 0, stale: true },
    })
    // Today's hot state remains live and has already rolled over.
    expect(store.getSnapshot()).toMatchObject({ connection: 'live', businessDate: '2026-08-17' })
    store.dispose()
  })

  it('bootstraps from /state and derives the demo view', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    expect(store.getSnapshot().connection).toBe('connecting')
    expect(store.getSnapshot().authorityMode).toBe('DEV_STAGING_ONLY')
    store.start()
    await settled()
    const state = store.getSnapshot()
    expect(state.connection).toBe('live')
    expect(state.snapshot.liangziState).toBe('liang_shen')
    expect(state.personal.remainingIncense).toBe(7)
    expect(controls.streamsOpened).toBe(1)
    store.dispose()
  })

  it('changes authority only through the explicit guarded mode action', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    expect(controls.requests.some(request => request.path === '/liangxiang/api/mode')).toBe(false)

    await store.selectAuthorityMode('local')
    await settled()
    const request = controls.requests.find(item => item.path === '/liangxiang/api/mode')
    expect(request).toMatchObject({
      body: '{"mode":"local"}',
      headers: { 'x-liangxiang-mode-action': 'configure' },
    })
    store.dispose()
  })

  it('does not drop an explicit mode choice while the initial state is loading', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await store.selectAuthorityMode('local')
    const request = controls.requests.find(item => item.path === '/liangxiang/api/mode')
    expect(request).toMatchObject({ body: '{"mode":"local"}' })
    store.dispose()
  })

  it('drops stale SSE frames (lower revision) and applies newer ones', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    const staleFrame = JSON.parse(JSON.stringify(service.getWireState())) as LiangxiangWireState
    // Newer server state: another 50k tokens observed.
    service.observeUsage('s1', {
      uncachedInputTokens: 447_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    }, { kind: 'live', firstLiveSeq: 0 }, 'deepseek-v4-pro')
    controls.pushFrame(service.getWireState())
    expect(store.getSnapshot().personal.earnedIncenseToday).toBe(8)
    // A stale replayed frame must not rewind the view.
    controls.pushFrame(staleFrame)
    expect(store.getSnapshot().personal.earnedIncenseToday).toBe(8)
    store.dispose()
  })

  it('accepts a lower revision when the Host process epoch changes', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    const restarted = JSON.parse(JSON.stringify(service.getWireState())) as LiangxiangWireState
    restarted.hostEpoch = restarted.hostEpoch + 1
    restarted.revision = 0
    restarted.personal.remainingIncense = 10
    controls.pushFrame(restarted)
    expect(store.getSnapshot().personal.earnedIncenseToday).toBe(10)
    store.dispose()
  })

  it('paints host-observed incense from the wire frame, not a frontend overlay', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    const before = store.getSnapshot().personal.remainingIncense
    const requestsBefore = controls.requests.length
    service.observeUsage('s1', {
      uncachedInputTokens: 447_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    }, { kind: 'live', firstLiveSeq: 0 }, 'deepseek-v4-pro')
    controls.pushFrame(service.getWireState())
    expect(store.getSnapshot().personal.remainingIncense).toBe(before + 1)
    expect(store.getSnapshot().personal.effectiveTokensToday).toBe(447_000)
    expect(controls.requests.length).toBe(requestsBefore)
    store.dispose()
  })

  it('retries a failed vote once with the SAME request id', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    controls.failNextFetches(1)
    const result = await store.vote('up')
    expect(result.status).toBe('accepted')
    const voteBodies = controls.requests
      .filter((request) => request.path === '/liangxiang/api/vote')
      .map((request) => JSON.parse(request.body ?? '{}') as { requestId: string })
    expect(voteBodies).toHaveLength(2)
    expect(voteBodies[0]?.requestId).toBe(voteBodies[1]?.requestId)
    // Exactly one spend on the service side.
    expect(service.getWireState().personal.usedIncenseToday).toBe(1)
    store.dispose()
  })

  it('sends a dump count once and spends that many sticks', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    const result = await store.vote('up', { count: 4 })
    expect(result).toMatchObject({ status: 'accepted', spentIncense: 4 })
    const voteBodies = controls.requests
      .filter((request) => request.path === '/liangxiang/api/vote')
      .map((request) => JSON.parse(request.body ?? '{}') as { count?: number })
    expect(voteBodies.at(-1)?.count).toBe(4)
    expect(service.getWireState().personal.usedIncenseToday).toBe(4)
    store.dispose()
  })

  it('goes offline after bounded SSE failures; refresh() reconnects', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    for (let i = 0; i < 5; i += 1) controls.emitSseError()
    expect(store.getSnapshot().connection).toBe('offline')
    // Last known state is preserved for rendering.
    expect(store.getSnapshot().snapshot.totalIncense).toBe(12_846)

    store.refresh()
    await settled()
    expect(store.getSnapshot().connection).toBe('live')
    expect(controls.streamsOpened).toBe(2)
    store.dispose()
  })

  it('while live, refresh() POSTs /refresh so hover can pick up a new case without waiting', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    const before = store.getSnapshot().activeCase.id
    store.refresh()
    await settled()
    expect(controls.requests.some((request) => request.path === '/liangxiang/api/refresh')).toBe(true)
    expect(store.getSnapshot().connection).toBe('live')
    expect(store.getSnapshot().activeCase.id).toBe(before)
    store.dispose()
  })

  it('reconcile() POSTs /reconcile to drop local observation and re-read incense', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    store.reconcile()
    await settled()
    expect(controls.requests.some((request) => request.path === '/liangxiang/api/reconcile')).toBe(true)
    expect(store.getSnapshot().connection).toBe('live')
    store.dispose()
  })

  it('bootstrap failure leaves an offline placeholder that still renders', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    controls.failNextFetches(1)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    const state = store.getSnapshot()
    expect(state.connection).toBe('offline')
    expect(state.snapshot.liangziState).toBe('waiting')
    store.dispose()
  })

  it('automatically reconnects after bootstrap failure without a page refresh', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    controls.failNextFetches(1)
    const store = createLiveLiangxiangStore(controls.transport)
    store.start()
    await settled()
    expect(store.getSnapshot().connection).toBe('offline')
    await new Promise((resolve) => setTimeout(resolve, 1_050))
    await settled()
    expect(store.getSnapshot().connection).toBe('live')
    expect(controls.streamsOpened).toBe(1)
    store.dispose()
  })
})
