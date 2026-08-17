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
  it('remaining 0 with global 96% stays 梁祖; remaining 100 with 90% stays 梁圣', () => {
    const zu = stateOf({ upVotes: 96, downVotes: 4, uniqueVoters: 5 })
    expect(zu.liangziState).toBe('liang_zu')
    const personalBroke = derivePersonalLiangQiState({ effectiveTokensToday: 0, usedIncenseToday: 0 })
    expect(personalBroke.remainingIncense).toBe(0)
    expect(stateOf({ upVotes: 96, downVotes: 4, uniqueVoters: 5 }).liangziState).toBe('liang_zu')

    const sheng = stateOf({ upVotes: 90, downVotes: 10, uniqueVoters: 5 })
    expect(sheng.liangziState).toBe('liang_sheng')
    const personalRich = derivePersonalLiangQiState({ effectiveTokensToday: 5_000_000, usedIncenseToday: 0 })
    expect(personalRich.remainingIncense).toBe(100)
    expect(stateOf({ upVotes: 90, downVotes: 10, uniqueVoters: 5 }).liangziState).toBe('liang_sheng')
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
  it('10% -> 30% -> 50% -> 70% -> 90% with one fixed personal state', () => {
    const personal = derivePersonalLiangQiState({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    const expectedStates = ['liang_gong', 'liang_gong', 'liang_zong', 'liang_shen', 'liang_sheng'] as const
    const ups = [10, 30, 50, 70, 90]
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
  it('94.7% -> 95%: 梁圣 -> 梁祖, personal spend leaves fill untouched', () => {
    // up=18 down=1 -> 94.737% (梁圣); one accepted up -> 19/20 = 95% (梁祖).
    let aggregate: GlobalVoteAggregate = { upVotes: 18, downVotes: 1, uniqueVoters: 2 }
    const before = stateOf(aggregate, 1)
    expect(before.liangziState).toBe('liang_sheng')

    let personal = derivePersonalLiangQiState({ effectiveTokensToday: 397_000, usedIncenseToday: 2 })
    personal = spendOneIncense(personal)
    aggregate = applyAcceptedVote(aggregate, 'up', true)
    const after = stateOf(aggregate, 2)

    expect(personal.remainingIncense).toBe(4)
    expect(personal.liangQiFill).toBeCloseTo(0.94, 10)
    expect(after.upRatio).toBe(0.95)
    expect(after.liangziState).toBe('liang_zu')
    expect(after.sequence).toBeGreaterThan(before.sequence)
  })

  it('69.x% -> 70%: 梁总 -> 梁神', () => {
    let aggregate: GlobalVoteAggregate = { upVotes: 69, downVotes: 30, uniqueVoters: 30 }
    expect(stateOf(aggregate).liangziState).toBe('liang_zong')
    aggregate = applyAcceptedVote(aggregate, 'up', true)
    expect(stateOf(aggregate).liangziState).toBe('liang_shen')
  })
})
