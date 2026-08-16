import { describe, expect, it } from 'vitest'
import { parseDevCreditBody, resolveDevCreditTokens } from '../src/host/dev-credit.ts'

describe('parseDevCreditBody', () => {
  it('accepts sticks or tokens, not both', () => {
    expect(parseDevCreditBody({ sticks: 9 })).toEqual({ sticks: 9 })
    expect(parseDevCreditBody({ effectiveTokens: 3_000 })).toEqual({ effectiveTokens: 3_000 })
    expect(() => parseDevCreditBody({})).toThrow(/exactly one/)
    expect(() => parseDevCreditBody({ sticks: 1, effectiveTokens: 1 })).toThrow(/exactly one/)
    expect(() => parseDevCreditBody({ sticks: 0 })).toThrow(/1–50/)
    expect(() => parseDevCreditBody({ sticks: 51 })).toThrow(/1–50/)
  })

  it('turns sticks into Pro-equivalent tokens', () => {
    expect(resolveDevCreditTokens({ sticks: 9 }, 50_000)).toBe(450_000)
    expect(resolveDevCreditTokens({ effectiveTokens: 3_000 }, 50_000)).toBe(3_000)
  })
})
