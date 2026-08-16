/**
 * Live store behavior over a fake transport: bootstrap, stale-frame
 * dropping, vote retry with the SAME request id, bounded SSE failure ->
 * offline, manual refresh reconnect.
 */
import { describe, expect, it } from 'vitest'
import { createLiveLiangbiaoStore, type LiveStoreTransport } from '../src/client/live-store.ts'
import { FakeAuthoritativeLiangService, type LiangServiceConfig } from '../src/host/fake-service.ts'
import type { LiangbiaoWireState } from '../src/shared/wire.ts'

const CONFIG: LiangServiceConfig = {
  timezone: 'Asia/Shanghai',
  tokenPerIncense: 50_000,
  snapshotRefreshSeconds: 300,
  seed: 'demo',
  caseTitle: 'DeepSeek Harness 是夯还是拉',
}

function makeService(): FakeAuthoritativeLiangService {
  const service = new FakeAuthoritativeLiangService(CONFIG, { now: () => Date.UTC(2026, 7, 16, 4) }, () => undefined)
  service.markReadyMemoryOnly('test')
  service.observeUsage('s1', {
    uncachedInputTokens: 397_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  }, { kind: 'live', firstLiveSeq: 0 })
  return service
}

interface FakeTransportControls {
  transport: LiveStoreTransport
  pushFrame(state: LiangbiaoWireState): void
  emitSseError(): void
  requests: Array<{ path: string, body: string | undefined }>
  failNextFetches(count: number): void
  streamsOpened: number
}

function fakeTransport(service: FakeAuthoritativeLiangService): FakeTransportControls {
  let handlers: { onFrame(data: string): void, onError(): void } | null = null
  let failCount = 0
  let requestCounter = 0
  const controls: FakeTransportControls = {
    requests: [],
    streamsOpened: 0,
    transport: {
      fetchJson(path, init) {
        controls.requests.push({ path, body: init?.body })
        if (failCount > 0) {
          failCount -= 1
          return Promise.reject(new Error('network down'))
        }
        if (path === '/liangbiao/api/state') {
          return Promise.resolve(JSON.parse(JSON.stringify(service.getWireState())) as unknown)
        }
        if (path === '/liangbiao/api/refresh') {
          service.refreshNow()
          return Promise.resolve(JSON.parse(JSON.stringify(service.getWireState())) as unknown)
        }
        if (path === '/liangbiao/api/reconcile') {
          service.reconcileNow()
          return Promise.resolve(JSON.parse(JSON.stringify(service.getWireState())) as unknown)
        }
        if (path === '/liangbiao/api/vote') {
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
  it('bootstraps from /state and derives the demo view', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangbiaoStore(controls.transport)
    expect(store.getSnapshot().connection).toBe('connecting')
    store.start()
    await settled()
    const state = store.getSnapshot()
    expect(state.connection).toBe('live')
    expect(state.snapshot.liangziState).toBe('liang_sheng')
    expect(state.personal.remainingIncense).toBe(7)
    expect(controls.streamsOpened).toBe(1)
    store.dispose()
  })

  it('drops stale SSE frames (lower revision) and applies newer ones', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangbiaoStore(controls.transport)
    store.start()
    await settled()
    const staleFrame = JSON.parse(JSON.stringify(service.getWireState())) as LiangbiaoWireState
    // Newer server state: another 50k tokens observed.
    service.observeUsage('s1', {
      uncachedInputTokens: 447_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    }, { kind: 'live', firstLiveSeq: 0 })
    controls.pushFrame(service.getWireState())
    expect(store.getSnapshot().personal.earnedIncenseToday).toBe(8)
    // A stale replayed frame must not rewind the view.
    controls.pushFrame(staleFrame)
    expect(store.getSnapshot().personal.earnedIncenseToday).toBe(8)
    store.dispose()
  })

  it('retries a failed vote once with the SAME request id', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangbiaoStore(controls.transport)
    store.start()
    await settled()
    controls.failNextFetches(1)
    const result = await store.vote('up')
    expect(result.status).toBe('accepted')
    const voteBodies = controls.requests
      .filter((request) => request.path === '/liangbiao/api/vote')
      .map((request) => JSON.parse(request.body ?? '{}') as { requestId: string })
    expect(voteBodies).toHaveLength(2)
    expect(voteBodies[0]?.requestId).toBe(voteBodies[1]?.requestId)
    // Exactly one spend on the service side.
    expect(service.getWireState().personal.usedIncenseToday).toBe(1)
    store.dispose()
  })

  it('goes offline after bounded SSE failures; refresh() reconnects', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangbiaoStore(controls.transport)
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
    const store = createLiveLiangbiaoStore(controls.transport)
    store.start()
    await settled()
    const before = store.getSnapshot().activeCase.id
    store.refresh()
    await settled()
    expect(controls.requests.some((request) => request.path === '/liangbiao/api/refresh')).toBe(true)
    expect(store.getSnapshot().connection).toBe('live')
    expect(store.getSnapshot().activeCase.id).toBe(before)
    store.dispose()
  })

  it('reconcile() POSTs /reconcile to drop local observation and re-read incense', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    const store = createLiveLiangbiaoStore(controls.transport)
    store.start()
    await settled()
    store.reconcile()
    await settled()
    expect(controls.requests.some((request) => request.path === '/liangbiao/api/reconcile')).toBe(true)
    expect(store.getSnapshot().connection).toBe('live')
    store.dispose()
  })

  it('bootstrap failure leaves an offline placeholder that still renders', async () => {
    const service = makeService()
    const controls = fakeTransport(service)
    controls.failNextFetches(1)
    const store = createLiveLiangbiaoStore(controls.transport)
    store.start()
    await settled()
    const state = store.getSnapshot()
    expect(state.connection).toBe('offline')
    expect(state.snapshot.liangziState).toBe('waiting')
    store.dispose()
  })
})
