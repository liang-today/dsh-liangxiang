/**
 * Mock store behavior (UI test/demo matrix of docs/020): vote flow, repeated
 * and mixed voting, insufficient incense, unique voters, threshold crossing,
 * zero-vote WAITING, and 凝香 (+1 incense) token growth.
 */
import { describe, expect, it } from 'vitest'
import { createMockLiangbiaoStore } from '../src/client/store.ts'

describe('default demo seed', () => {
  it('boots the frozen scenario: 83% 夯 / 梁祖 / 5 炷 / fill 94%', () => {
    const store = createMockLiangbiaoStore()
    const { snapshot, personal, activeCase } = store.getSnapshot()
    expect(activeCase.title).toBe('DeepSeek Harness 是夯还是拉')
    expect(snapshot.totalIncense).toBe(12_846)
    expect(snapshot.liangziState).toBe('liang_zu')
    expect(Math.round((snapshot.upRatio ?? 0) * 100)).toBe(83)
    expect(personal.remainingIncense).toBe(5)
    expect(personal.liangQiFill).toBeCloseTo(0.94, 10)
    expect(personal.tokensToNextIncense).toBe(3_000)
  })
})

describe('vote flow', () => {
  it('accepted vote: remaining 5->4, fill unchanged, global up +1, new sequence', async () => {
    const store = createMockLiangbiaoStore()
    const before = store.getSnapshot()
    const result = await store.vote('up')
    expect(result.status).toBe('accepted')
    const after = store.getSnapshot()
    expect(after.personal.remainingIncense).toBe(4)
    expect(after.personal.usedIncenseToday).toBe(3)
    expect(after.personal.liangQiFill).toBe(before.personal.liangQiFill)
    expect(after.personal.tokensToNextIncense).toBe(before.personal.tokensToNextIncense)
    expect(after.snapshot.upVotes).toBe(before.snapshot.upVotes + 1)
    expect(after.snapshot.sequence).toBeGreaterThan(before.snapshot.sequence)
    // Ratios + state in the new snapshot still come from the same counts.
    expect(after.snapshot.upRatio).toBe(after.snapshot.upVotes / after.snapshot.totalIncense)
  })

  it('five sticks allow five votes (repeated or mixed); the sixth is rejected', async () => {
    const store = createMockLiangbiaoStore()
    const directions = ['up', 'down', 'up', 'up', 'down'] as const
    for (const direction of directions) {
      expect((await store.vote(direction)).status).toBe('accepted')
    }
    const before = store.getSnapshot()
    const sixth = await store.vote('up')
    expect(sixth.status).toBe('rejected')
    if (sixth.status === 'rejected') expect(sixth.reason).toBe('insufficient_incense')
    const after = store.getSnapshot()
    expect(after.snapshot.upVotes).toBe(before.snapshot.upVotes)
    expect(after.snapshot.downVotes).toBe(before.snapshot.downVotes)
    expect(after.personal.remainingIncense).toBe(0)
  })

  it('counts a unique voter only on the first accepted vote', async () => {
    const store = createMockLiangbiaoStore({ usedIncenseToday: 0, effectiveTokensToday: 250_000 })
    const before = store.getSnapshot().snapshot.uniqueVoters
    await store.vote('up')
    expect(store.getSnapshot().snapshot.uniqueVoters).toBe(before + 1)
    await store.vote('down')
    expect(store.getSnapshot().snapshot.uniqueVoters).toBe(before + 1)
  })

  it('a vote can cross a global threshold: 79.x% -> 80% flips 梁圣 -> 梁祖', async () => {
    const store = createMockLiangbiaoStore({
      upVotes: 79,
      downVotes: 20,
      uniqueVoters: 30,
      effectiveTokensToday: 100_000,
      usedIncenseToday: 0,
    })
    expect(store.getSnapshot().snapshot.liangziState).toBe('liang_sheng')
    await store.vote('up')
    const after = store.getSnapshot()
    expect(after.snapshot.upRatio).toBe(0.8)
    expect(after.snapshot.liangziState).toBe('liang_zu')
    // The flip came from the ratio; personal fill did not move.
    expect(after.personal.liangQiFill).toBe(0)
    expect(after.personal.remainingIncense).toBe(1)
  })
})

describe('zero-vote seed', () => {
  it('renders WAITING with null ratios', () => {
    const store = createMockLiangbiaoStore({ upVotes: 0, downVotes: 0, uniqueVoters: 0 })
    const { snapshot } = store.getSnapshot()
    expect(snapshot.liangziState).toBe('waiting')
    expect(snapshot.upRatio).toBeNull()
    expect(snapshot.downRatio).toBeNull()
  })
})

describe('token growth (凝香)', () => {
  it('+3,000 tokens on a 94% ring: earned +1, remaining +1, fill wraps to 0', () => {
    const store = createMockLiangbiaoStore()
    const before = store.getSnapshot().personal.tokensToNextIncense
    expect(before).toBe(3_000)
    store.addEffectiveTokens(1_000)
    expect(store.getSnapshot().personal.tokensToNextIncense).toBe(2_000)
    store.addEffectiveTokens(2_000)
    const { personal, snapshot } = store.getSnapshot()
    expect(personal.earnedIncenseToday).toBe(8)
    expect(personal.remainingIncense).toBe(6)
    expect(personal.liangQiFill).toBe(0)
    expect(personal.tokensToNextIncense).toBe(50_000)
    // Personal growth never moves the global Liangzi state.
    expect(snapshot.liangziState).toBe('liang_zu')
    expect(snapshot.upVotes).toBe(10_665)
  })

  it('personal token growth leaves the global snapshot state untouched', () => {
    const store = createMockLiangbiaoStore({ upVotes: 65, downVotes: 35, uniqueVoters: 10 })
    expect(store.getSnapshot().snapshot.liangziState).toBe('liang_sheng')
    store.addEffectiveTokens(500_000)
    expect(store.getSnapshot().snapshot.liangziState).toBe('liang_sheng')
  })
})

describe('store subscription', () => {
  it('notifies subscribers on every accepted transition and supports unsubscribe', async () => {
    const store = createMockLiangbiaoStore()
    let notified = 0
    const unsubscribe = store.subscribe(() => {
      notified += 1
    })
    await store.vote('up')
    expect(notified).toBe(1)
    unsubscribe()
    await store.vote('down')
    expect(notified).toBe(1)
  })
})
