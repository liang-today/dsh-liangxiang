/**
 * P0 personal/global decoupling:
 *  - personal incense/token progress never selects the Liangzi state;
 *  - global ratio changes never move personal incense/token progress;
 *  - an accepted vote may change the Liangzi state ONLY through the global
 *    ratio (threshold crossing).
 */
import { describe, expect, it } from 'vitest'
import {
  applyAcceptedVote,
  buildPublicSnapshot,
  derivePersonalLiangQiState,
  spendOneIncense,
  type GlobalVoteAggregate,
} from '../src/domain/index.ts'

function stateOf(aggregate: GlobalVoteAggregate, sequence = 1) {
  return buildPublicSnapshot({ caseId: 'case-x', aggregate, capturedAt: 0, sequence })
}

describe('personal state cannot select the Liangzi state', () => {
  it('remaining 0 with global 92% stays 梁祖; remaining 100 with 65% stays 梁总', () => {
    const zu = stateOf({ upVotes: 92, downVotes: 8, uniqueVoters: 5 })
    expect(zu.liangziState).toBe('liang_zu')
    const personalBroke = derivePersonalLiangQiState({ effectiveTokensToday: 0, usedIncenseToday: 0 })
    expect(personalBroke.remainingIncense).toBe(0)
    // Snapshot is a function of global counts only — recomputing with any
    // personal state present in scope yields the identical result.
    expect(stateOf({ upVotes: 92, downVotes: 8, uniqueVoters: 5 }).liangziState).toBe('liang_zu')

    const zong = stateOf({ upVotes: 65, downVotes: 35, uniqueVoters: 5 })
    expect(zong.liangziState).toBe('liang_zong')
    const personalRich = derivePersonalLiangQiState({ effectiveTokensToday: 5_000_000, usedIncenseToday: 0 })
    expect(personalRich.remainingIncense).toBe(100)
    expect(stateOf({ upVotes: 65, downVotes: 35, uniqueVoters: 5 }).liangziState).toBe('liang_zong')
  })

  it('personal token growth (397k -> 447k -> 497k) leaves the snapshot untouched', () => {
    const aggregate: GlobalVoteAggregate = { upVotes: 68, downVotes: 32, uniqueVoters: 10 }
    const before = stateOf(aggregate, 7)
    for (const tokens of [397_000, 447_000, 497_000]) {
      const personal = derivePersonalLiangQiState({ effectiveTokensToday: tokens, usedIncenseToday: 2 })
      expect(personal.effectiveTokensToday).toBe(tokens)
      const after = stateOf(aggregate, 7)
      expect(after).toEqual(before)
    }
  })
})

describe('global ratio changes cannot move personal LiangQi', () => {
  it('55% -> 65% -> 75% -> 85% -> 95% with one fixed personal state', () => {
    const personal = derivePersonalLiangQiState({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    const expectedStates = ['liang_gong', 'liang_zong', 'liang_shen', 'liang_sheng', 'liang_zu'] as const
    const ups = [55, 65, 75, 85, 95]
    ups.forEach((up, index) => {
      const snapshot = stateOf({ upVotes: up, downVotes: 100 - up, uniqueVoters: 10 }, index + 1)
      expect(snapshot.liangziState).toBe(expectedStates[index])
    })
    // Personal accounting is untouched by any of those snapshots.
    expect(personal.remainingIncense).toBe(5)
    expect(personal.liangQiFill).toBeCloseTo(0.94, 10)
    expect(personal.tokensToNextIncense).toBe(3_000)
  })
})

describe('threshold crossing through an accepted vote', () => {
  it('79.x% -> 80%: 梁神 -> 梁圣, personal spend leaves fill untouched', () => {
    // up=79 down=20 -> 79.798% (梁神); one accepted up -> 80/100 = 80% (梁圣).
    let aggregate: GlobalVoteAggregate = { upVotes: 79, downVotes: 20, uniqueVoters: 30 }
    const before = stateOf(aggregate, 1)
    expect(before.liangziState).toBe('liang_shen')

    let personal = derivePersonalLiangQiState({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    personal = spendOneIncense(personal)
    aggregate = applyAcceptedVote(aggregate, 'up', true)
    const after = stateOf(aggregate, 2)

    // Personal: only the pool moved.
    expect(personal.remainingIncense).toBe(4)
    expect(personal.liangQiFill).toBeCloseTo(0.94, 10)
    // Global: the state changed because THE RATIO changed.
    expect(after.upRatio).toBe(0.8)
    expect(after.liangziState).toBe('liang_sheng')
    expect(after.sequence).toBeGreaterThan(before.sequence)
  })

  it('89.x% -> 90%: 梁圣 -> 梁祖', () => {
    let aggregate: GlobalVoteAggregate = { upVotes: 89, downVotes: 10, uniqueVoters: 30 }
    expect(stateOf(aggregate).liangziState).toBe('liang_sheng') // 89.9%
    aggregate = applyAcceptedVote(aggregate, 'up', false)
    expect(stateOf(aggregate, 2).liangziState).toBe('liang_zu') // 90%
  })
})
