/**
 * Vote vocabulary: strictly binary, validated request IDs, validated case
 * shapes. Obsolete third options must be rejected as invalid.
 */
import { describe, expect, it } from 'vitest'
import {
  DomainError,
  assertBusinessDate,
  assertRequestId,
  assertValidCase,
  assertVoteType,
  isRequestId,
  isVoteType,
  type DailyLiangCase,
} from '../src/domain/index.ts'

describe('vote type is strictly binary', () => {
  it('accepts only up/down', () => {
    expect(isVoteType('up')).toBe(true)
    expect(isVoteType('down')).toBe(true)
  })

  it.each(['稳', 'steady', 'neutral', 'abstain', 'UP', 'Down', '', 3, null, undefined])(
    'rejects %s',
    (value) => {
      expect(isVoteType(value)).toBe(false)
      expect(() => assertVoteType(value)).toThrow(DomainError)
    },
  )
})

describe('request id', () => {
  it('accepts 8-128 chars of [A-Za-z0-9._-]', () => {
    expect(isRequestId('vote-0001')).toBe(true)
    expect(isRequestId('a'.repeat(128))).toBe(true)
    expect(() => assertRequestId('mock-abc.123_x')).not.toThrow()
  })

  it.each(['short', 'a'.repeat(129), 'has space 123', '票票票票票票票票', 42, null])(
    'rejects %s',
    (value) => {
      expect(isRequestId(value)).toBe(false)
      expect(() => assertRequestId(value)).toThrow(DomainError)
    },
  )
})

describe('daily case validation', () => {
  const base: DailyLiangCase = {
    id: 'case-001',
    businessDate: '2026-08-16',
    title: 'DeepSeek Harness 是夯还是拉',
    status: 'active',
    createdAt: 1_755_000_000_000,
    tokenPerIncense: 50_000,
  }

  it('accepts a well-formed active case', () => {
    expect(() => assertValidCase(base)).not.toThrow()
  })

  it('rejects malformed dates, statuses, and policies', () => {
    expect(() => assertBusinessDate('2026/08/16')).toThrow(DomainError)
    expect(() => assertBusinessDate('today')).toThrow(DomainError)
    expect(() => assertValidCase({ ...base, status: 'open' as unknown as 'active' })).toThrow(DomainError)
    expect(() => assertValidCase({ ...base, title: '' })).toThrow(DomainError)
    expect(() => assertValidCase({ ...base, tokenPerIncense: 0 })).toThrow(DomainError)
  })
})
