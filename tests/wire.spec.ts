/**
 * Wire boundary validation: round-trips of real service payloads, rejection
 * of malformed/inconsistent frames (raw counts that violate invariants).
 */
import { describe, expect, it } from 'vitest'
import { FakeAuthoritativeLiangService, type LiangServiceConfig } from '../src/host/fake-service.ts'
import {
  WireError,
  parseWireState,
  parseWireVoteRequest,
  parseWireVoteResponse,
} from '../src/shared/wire.ts'
import { wireToViewState } from '../src/client/store.ts'

const CONFIG: LiangServiceConfig = {
  timezone: 'Asia/Shanghai',
  tokenPerIncense: 50_000,
  snapshotRefreshSeconds: 300,
  seed: 'demo',
  caseTitle: 'DeepSeek Harness 是夯还是拉',
}

function liveState() {
  const service = new FakeAuthoritativeLiangService(CONFIG, { now: () => Date.UTC(2026, 7, 16, 4) }, () => undefined)
  service.markReadyMemoryOnly('test')
  service.observeUsage('s1', {
    uncachedInputTokens: 300_000,
    cacheReadTokens: 90_000,
    cacheWriteTokens: 7_000,
    outputTokens: 0,
  }, { kind: 'live', firstLiveSeq: 0 })
  return { service, state: service.getWireState() }
}

describe('state frame round-trip', () => {
  it('a real service frame parses and derives a consistent view state', () => {
    const { state } = liveState()
    const parsed = parseWireState(JSON.parse(JSON.stringify(state)) as unknown)
    expect(parsed.revision).toBe(state.revision)
    const view = wireToViewState(parsed, 'live')
    // 397,000 effective -> the frozen demo LiangQi numbers.
    expect(view.personal.earnedIncenseToday).toBe(7)
    expect(view.personal.tokenRemainder).toBe(47_000)
    // demo seed 83% -> 梁圣, derived from the SAME raw counts as the ratios.
    expect(view.snapshot.liangziState).toBe('liang_sheng')
    expect(view.snapshot.totalIncense).toBe(12_846)
    expect(view.authorityMode).toBe('LOCAL_FAKE_DEV')
  })

  it('a vote response round-trips result + state', () => {
    const { service, state } = liveState()
    const outcome = service.vote({ caseId: state.activeCase.id, voteType: 'up', requestId: 'req-wire-001' })
    const parsed = parseWireVoteResponse(JSON.parse(JSON.stringify({
      schemaVersion: 1,
      result: outcome.result,
      state: outcome.state,
    })) as unknown)
    expect(parsed.result.status).toBe('accepted')
    if (parsed.result.status === 'accepted') {
      expect(parsed.result.remainingIncense).toBe(6)
    }
  })
})

describe('malformed frames fail safe', () => {
  const { state } = liveState()
  const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(state)) as Record<string, unknown>

  it.each([
    ['wrong schema version', (frame: Record<string, unknown>) => { frame.schemaVersion = 2 }],
    ['unknown authority mode', (frame: Record<string, unknown>) => { frame.authorityMode = 'VERIFIED_PRODUCTION' }],
    ['negative counts', (frame: Record<string, unknown>) => { (frame.global as Record<string, unknown>).upVotes = -1 }],
    ['unique voters above total', (frame: Record<string, unknown>) => { (frame.global as Record<string, unknown>).uniqueVoters = 999_999_999 }],
    ['used above earned', (frame: Record<string, unknown>) => { (frame.personal as Record<string, unknown>).usedIncenseToday = 99 }],
    ['missing case title', (frame: Record<string, unknown>) => { (frame.activeCase as Record<string, unknown>).title = '' }],
    ['NaN capturedAt', (frame: Record<string, unknown>) => { (frame.global as Record<string, unknown>).capturedAt = 'soon' }],
  ])('rejects %s', (_label, mutate) => {
    const frame = base()
    mutate(frame)
    expect(() => parseWireState(frame)).toThrow(WireError)
  })

  it('rejects non-object frames', () => {
    expect(() => parseWireState('[]')).toThrow(WireError)
    expect(() => parseWireState(null)).toThrow(WireError)
  })
})

describe('vote request validation', () => {
  it('accepts the minimal intent and nothing more is required', () => {
    expect(parseWireVoteRequest({ caseId: 'local-2026-08-16', voteType: 'down', requestId: 'req-000042' }))
      .toEqual({ caseId: 'local-2026-08-16', voteType: 'down', requestId: 'req-000042' })
  })

  it.each([
    [{ caseId: 'c', voteType: '稳', requestId: 'req-000042' }],
    [{ caseId: 'c', voteType: 'up', requestId: 'short' }],
    [{ caseId: '', voteType: 'up', requestId: 'req-000042' }],
    [{ voteType: 'up', requestId: 'req-000042' }],
    ['not an object'],
  ])('rejects malformed intent %#', (body) => {
    expect(() => parseWireVoteRequest(body)).toThrow(WireError)
  })
})
