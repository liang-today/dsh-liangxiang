import { describe, expect, it } from 'vitest'
import {
  DomainError,
  VOTE_BURST_CAP,
  VOTE_COUNT_MAX,
  VOTE_REFILL_PER_MINUTE,
  clampVoteSpend,
  voteBudgetAvailable,
} from '../src/domain/index.ts'

describe('vote incense budget', () => {
  it('refills 50 sticks per idle minute and caps at 500', () => {
    expect(VOTE_REFILL_PER_MINUTE).toBe(50)
    expect(VOTE_BURST_CAP).toBe(500)
    expect(voteBudgetAvailable(0, 0, 60_000)).toBe(50)
    expect(voteBudgetAvailable(0, 0, 10 * 60_000)).toBe(500)
    expect(voteBudgetAvailable(0, 0, 30 * 60_000)).toBe(500)
    expect(voteBudgetAvailable(12, 0, 0)).toBe(12)
  })

  it('clamps a dump to remaining incense, burst cap, and live budget', () => {
    expect(clampVoteSpend(800, 80, 40)).toBe(40)
    expect(clampVoteSpend(80, 12, 500)).toBe(12)
    expect(clampVoteSpend(VOTE_COUNT_MAX, 900, 900)).toBe(VOTE_COUNT_MAX)
    expect(clampVoteSpend(1, 0, 50)).toBe(0)
  })

  it('rejects a non-positive requested spend', () => {
    expect(() => clampVoteSpend(0, 10, 10)).toThrow(DomainError)
  })
})
