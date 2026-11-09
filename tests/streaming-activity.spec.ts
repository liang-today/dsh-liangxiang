import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { attachStreamingActivity } from '../src/compat/dsh/streaming-activity.ts'
import { DayEndService } from '../src/host/day-end-service.ts'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { parseWireState } from '../src/shared/wire.ts'

// The actual pinned dispatcher, not a reimplementation of its scoped protocol.
const dshRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
const { agentEvents } = await import(dshRequire.resolve('@deepseek-ai/dsh-agent')) as {
  agentEvents(ctx: Context, agent: object): { emit(name: string, payload: unknown): void }
}
function fixture() {
  const ctx = new Context()
  const updates: boolean[] = []
  const dispose = attachStreamingActivity(ctx, active => updates.push(active))
  const a = agentEvents(ctx, {})
  const b = agentEvents(ctx, {})
  const frame = (dispatcher: typeof a, type: string, revision: number, attemptId = 'one') => {
    dispatcher.emit('agent/assistant-stream', { frame: { type, revision, attemptId } })
  }
  return { ctx, updates, dispose, a, b, frame }
}

describe('pinned DSH transient request activity', () => {
  it('follows start/end and emits no extra update for a thousand chunks', () => {
    const f = fixture()
    f.frame(f.a, 'start', 1)
    for (let revision = 2; revision < 1002; revision++) f.frame(f.a, 'chunk', revision)
    expect(f.updates).toEqual([true])
    f.frame(f.a, 'end', 1002)
    expect(f.updates).toEqual([true, false])
    f.dispose()
  })
  it('joins a request already streaming without reading its chunk payload', () => {
    const f = fixture()
    const frame = { type: 'chunk', revision: 7, attemptId: 'joined',
      get chunk(): never { throw new Error('content must not be read') } }
    f.a.emit('agent/assistant-stream', { frame })
    expect(f.updates).toEqual([true])
    f.frame(f.a, 'end', 8, 'joined')
    expect(f.updates).toEqual([true, false])
    f.dispose()
  })
  it('aggregates concurrent agents without clearing an unrelated request', () => {
    const f = fixture()
    f.frame(f.a, 'start', 1)
    f.frame(f.b, 'start', 1)
    f.frame(f.a, 'end', 2)
    expect(f.updates).toEqual([true])
    f.frame(f.b, 'end', 2)
    expect(f.updates).toEqual([true, false])
    f.dispose()
  })
  it('ignores stale frames and old attempt ends across a retry', () => {
    const f = fixture()
    f.frame(f.a, 'start', 1)
    f.frame(f.a, 'start', 3, 'retry')
    f.frame(f.a, 'end', 2)
    f.frame(f.a, 'end', 4)
    expect(f.updates).toEqual([true])
    f.frame(f.a, 'end', 5, 'retry')
    f.frame(f.a, 'chunk', 3, 'retry')
    expect(f.updates).toEqual([true, false])
    f.dispose()
  })
  it.each(['agent/status', 'agent/disposed'])('clears abandoned activity on %s', name => {
    const f = fixture()
    f.frame(f.a, 'start', 1)
    f.a.emit(name, { status: 'idle' })
    expect(f.updates).toEqual([true, false])
    f.dispose()
  })
  it('unsubscribes on unload and starts cold on reattachment', () => {
    const f = fixture()
    f.frame(f.a, 'start', 1)
    f.dispose()
    f.frame(f.a, 'chunk', 2)
    expect(f.updates).toEqual([true, false])
    const restarted: boolean[] = []
    const stop = attachStreamingActivity(f.ctx, active => restarted.push(active))
    expect(restarted).toEqual([])
    f.frame(f.a, 'chunk', 3)
    f.frame(f.a, 'end', 4)
    expect(restarted).toEqual([true, false])
    stop()
  })
  it('does not animate for tools or an agent merely marked running', () => {
    const f = fixture()
    f.a.emit('agent/status', { status: 'running' })
    expect(f.updates).toEqual([])
    f.dispose()
  })
})

describe('activity is not an authority', () => {
  it('changes only additive metadata/revision and preserves votes and settlement', async () => {
    const authority = new FakeAuthoritativeLiangService({ timezone: 'Asia/Shanghai', tokenPerIncense: 50_000,
      snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '今日梁案' }, { now: () => Date.UTC(2026, 10, 4, 4) }, () => undefined)
    authority.markReadyMemoryOnly('activity-test')
    const host = new DayEndService(authority, { now: () => Date.UTC(2026, 10, 4, 4) }, () => false, () => undefined)
    const before = host.getWireState()
    let notifications = 0
    const unsubscribe = host.subscribe(() => { notifications++ })
    host.setStreamingActive(true)
    host.setStreamingActive(true)
    const active = parseWireState(host.getWireState())
    expect(active.personal).toEqual(before.personal)
    expect(active.global).toEqual(before.global)
    expect(active.accounting).toEqual(before.accounting)
    expect(active.streamingActive).toBe(true)
    expect(active.revision).toBe(before.revision + 1)
    expect(notifications).toBe(1)
    authority.creditSimulatedUsage(50_000)
    const credited = host.getWireState()
    expect(credited.personal.remainingIncense).toBeGreaterThan(before.personal.remainingIncense)
    const result = await host.vote({ caseId: credited.activeCase.id, voteType: 'up', requestId: 'streaming-vote-001' })
    expect(result.result.status).toBe('accepted')
    expect(result.state.streamingActive).toBe(true)
    expect(result.state.revision).toBeGreaterThan(active.revision)
    host.setStreamingActive(false)
    expect(host.getWireState().personal).toEqual(result.state.personal)
    unsubscribe()
    host.dispose()
  })
})


it('expires motion after a missing end event without inventing a settlement', async () => {
  vi.useFakeTimers()
  const f = fixture()
  try {
    f.frame(f.a, 'start', 1)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(f.updates).toEqual([true, false])
    f.frame(f.a, 'chunk', 2)
    expect(f.updates).toEqual([true, false, true])
  } finally { f.dispose(); vi.useRealTimers() }
})
