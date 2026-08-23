import { describe, expect, it } from 'vitest'
import { DEFAULT_VOTE_RATE_LIMIT_PER_MINUTE, VoteRateLimiter, VOTE_RATE_WINDOW_MS } from '../src/backend/vote-rate-limit.ts'
import { VOTE_BURST_CAP } from '../src/domain/index.ts'

describe('hard-bounded vote rate limiter', () => {
  it('caps one installation at 50 incense submissions per minute by default', () => {
    expect(DEFAULT_VOTE_RATE_LIMIT_PER_MINUTE).toBe(50)
  })

  it('never retains more than the configured number of active identities', () => {
    const limiter = new VoteRateLimiter(5, 32)
    for (let index = 0; index < 12_000; index += 1) {
      limiter.check(`install-${index}`, 1_000)
    }
    expect(limiter.activeKeys).toBe(32)
    expect(limiter.check('install-overflow', 1_000)).toMatchObject({
      allowed: false,
      reason: 'active_key_capacity',
    })
  })

  it('evicts expired keys and admits new identities after the window', () => {
    const limiter = new VoteRateLimiter(2, 2)
    expect(limiter.check('one', 0).allowed).toBe(true)
    expect(limiter.check('two', 0).allowed).toBe(true)
    expect(limiter.check('three', 1).allowed).toBe(false)
    expect(limiter.check('three', VOTE_RATE_WINDOW_MS + 1).allowed).toBe(true)
    expect(limiter.activeKeys).toBe(1)
  })

  it('keeps the per-installation request cap', () => {
    const limiter = new VoteRateLimiter(2, 10)
    expect(limiter.check('one', 0).allowed).toBe(true)
    expect(limiter.check('one', 1).allowed).toBe(true)
    expect(limiter.check('one', 2)).toMatchObject({ allowed: false, reason: 'per_installation' })
  })

  it('lets a 10-minute idle dump spend the 500-stick burst', () => {
    const limiter = new VoteRateLimiter(50, 16)
    expect(limiter.consume('one', 50, 0).allowed).toBe(true)
    expect(limiter.peek('one', 0)).toBe(0)
    expect(limiter.peek('one', 10 * VOTE_RATE_WINDOW_MS)).toBe(VOTE_BURST_CAP)
    expect(limiter.consume('one', 500, 10 * VOTE_RATE_WINDOW_MS).allowed).toBe(true)
    expect(limiter.peek('one', 10 * VOTE_RATE_WINDOW_MS)).toBe(0)
  })

  it('reconstructs a missing bucket from the last accepted vote time', () => {
    const limiter = new VoteRateLimiter(50, 16)
    expect(limiter.peek('fresh', 1_000)).toBe(50)
    expect(limiter.peek('returning', 10 * 60_000, 0)).toBe(VOTE_BURST_CAP)
    expect(limiter.consume('returning', 120, 10 * 60_000, 0)).toMatchObject({
      allowed: true,
      available: 380,
    })
  })
})
