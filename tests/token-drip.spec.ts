import { describe, expect, it } from 'vitest'
import { cappedClaimedTokens } from '../src/backend/token-drip.ts'

describe('cappedClaimedTokens', () => {
  const start = 1_000_000

  it('lets an uncapped claim through when maxTokensPerMinute is 0', () => {
    expect(cappedClaimedTokens({
      requested: 1_000_000_000,
      current: 0,
      identityCreatedAt: start,
      now: start,
      maxTokensPerMinute: 0,
    })).toBe(1_000_000_000)
  })

  it('grants a partial minute of tokens but not a full incense before 60s', () => {
    expect(cappedClaimedTokens({
      requested: 150_000,
      current: 0,
      identityCreatedAt: start,
      now: start + 59_999,
      maxTokensPerMinute: 50_000,
    })).toBe(49_999)
  })

  it('grants at most one incense-worth after one minute', () => {
    expect(cappedClaimedTokens({
      requested: 150_000,
      current: 0,
      identityCreatedAt: start,
      now: start + 60_000,
      maxTokensPerMinute: 50_000,
    })).toBe(50_000)
  })

  it('never rewinds an already-granted claim', () => {
    expect(cappedClaimedTokens({
      requested: 10_000,
      current: 80_000,
      identityCreatedAt: start,
      now: start + 120_000,
      maxTokensPerMinute: 50_000,
    })).toBe(80_000)
  })

  it('caps a 1e12 lie to elapsed minutes times the rate', () => {
    expect(cappedClaimedTokens({
      requested: 1e12,
      current: 0,
      identityCreatedAt: start,
      now: start + 3 * 60_000,
      maxTokensPerMinute: 50_000,
    })).toBe(150_000)
  })
})
