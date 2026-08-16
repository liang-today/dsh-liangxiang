/**
 * P0 global snapshot: ratios + Liangzi state always come from one snapshot
 * (same counts, same sequence); zero votes publish null ratios + WAITING.
 */
import { describe, expect, it } from 'vitest'
import {
  DomainError,
  applyAcceptedVote,
  buildPublicSnapshot,
  deriveLiangziState,
  type GlobalVoteAggregate,
} from '../src/domain/index.ts'

const CASE_ID = 'case-test'

function snapshotOf(aggregate: GlobalVoteAggregate, sequence = 1) {
  return buildPublicSnapshot({ caseId: CASE_ID, aggregate, capturedAt: 1_755_000_000_000, sequence })
}

describe('buildPublicSnapshot', () => {
  it('frozen demo: 10,665 up / 2,181 down -> 83% 夯, 梁圣, 香火 12,846', () => {
    const snapshot = snapshotOf({ upVotes: 10_665, downVotes: 2_181, uniqueVoters: 2_841 })
    expect(snapshot.totalIncense).toBe(12_846)
    expect(snapshot.upRatio).toBeCloseTo(10_665 / 12_846, 10)
    expect(snapshot.downRatio).toBeCloseTo(2_181 / 12_846, 10)
    expect(Math.round((snapshot.upRatio ?? 0) * 100)).toBe(83)
    expect(snapshot.liangziState).toBe('liang_sheng')
    expect(snapshot.uniqueVoters).toBe(2_841)
  })

  it('state is derived from the SAME counts the ratios use (self-consistency)', () => {
    for (const aggregate of [
      { upVotes: 59, downVotes: 41, uniqueVoters: 10 },
      { upVotes: 68, downVotes: 32, uniqueVoters: 10 },
      { upVotes: 92, downVotes: 8, uniqueVoters: 10 },
    ]) {
      const snapshot = snapshotOf(aggregate)
      expect(snapshot.liangziState).toBe(deriveLiangziState(aggregate.upVotes, aggregate.downVotes))
      expect(snapshot.upRatio).toBe(aggregate.upVotes / (aggregate.upVotes + aggregate.downVotes))
    }
  })

  it('zero votes -> null ratios + WAITING (no fake 50/50)', () => {
    const snapshot = snapshotOf({ upVotes: 0, downVotes: 0, uniqueVoters: 0 })
    expect(snapshot.upRatio).toBeNull()
    expect(snapshot.downRatio).toBeNull()
    expect(snapshot.liangziState).toBe('waiting')
    expect(snapshot.totalIncense).toBe(0)
  })

  it('fails safe on malformed aggregates', () => {
    expect(() => snapshotOf({ upVotes: -1, downVotes: 0, uniqueVoters: 0 })).toThrow(DomainError)
    expect(() => snapshotOf({ upVotes: 0, downVotes: Number.NaN, uniqueVoters: 0 })).toThrow(DomainError)
    expect(() => snapshotOf({ upVotes: 1, downVotes: 1, uniqueVoters: 3 })).toThrow(DomainError)
    expect(() => buildPublicSnapshot({
      caseId: CASE_ID,
      aggregate: { upVotes: 1, downVotes: 1, uniqueVoters: 1 },
      capturedAt: Number.NaN,
      sequence: 1,
    })).toThrow(DomainError)
  })
})

describe('applyAcceptedVote', () => {
  it('increments exactly one direction and counts first-time voters once', () => {
    const empty: GlobalVoteAggregate = { upVotes: 0, downVotes: 0, uniqueVoters: 0 }
    const afterUp = applyAcceptedVote(empty, 'up', true)
    expect(afterUp).toEqual({ upVotes: 1, downVotes: 0, uniqueVoters: 1 })
    const afterDown = applyAcceptedVote(afterUp, 'down', false)
    expect(afterDown).toEqual({ upVotes: 1, downVotes: 1, uniqueVoters: 1 })
  })
})
