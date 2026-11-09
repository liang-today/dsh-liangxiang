import { describe, expect, it } from 'vitest'
import { compareMarketRatios, distributeMarketPool, marketBusinessHour } from '../src/domain/market.ts'

describe('exact daily pool rules', () => {
  it('compares beyond the six displayed decimal places without floating rounding', () => {
    expect(compareMarketRatios({ up_votes: 500_000_001, down_votes: 500_000_000 }, { up_votes: 1, down_votes: 1 })).toBe(1)
    expect(compareMarketRatios({ up_votes: 0, down_votes: 0 }, { up_votes: 1, down_votes: 1 })).toBeNull()
    expect(compareMarketRatios({ up_votes: Number.MAX_SAFE_INTEGER, down_votes: Number.MAX_SAFE_INTEGER - 1 },
      { up_votes: 1, down_votes: 1 })).toBe(1)
  })
  it('conserves whole sticks for uneven pools and deterministic ties', () => {
    const positions = [
      { id: 1, side: 'long' as const, count: 10 }, { id: 2, side: 'long' as const, count: 10 },
      { id: 3, side: 'long' as const, count: 10 }, { id: 4, side: 'short' as const, count: 20 },
    ]
    expect([...distributeMarketPool(positions, 'long').values()]).toEqual([17, 17, 16, 0])
    for (let i = 1; i <= 300; i += 1) {
      const p = positions.map((v, n) => ({ ...v, count: (i * (n + 7)) % 101 + 1 }))
      for (const result of ['long', 'short', null] as const) {
        const payouts = [...distributeMarketPool(p, result).values()]
        expect(payouts.every(Number.isSafeInteger)).toBe(true)
        expect(payouts.reduce((a, b) => a + b, 0)).toBe(p.reduce((a, b) => a + b.count, 0))
      }
    }
  })
  it('resolves explicit timezone hours across daylight-saving dates', () => {
    expect(marketBusinessHour('2026-08-16', 'Asia/Shanghai', 12)).toBe(Date.UTC(2026, 7, 16, 4))
    expect(marketBusinessHour('2026-10-25', 'Europe/London', 12)).toBe(Date.UTC(2026, 9, 25, 12))
    expect(marketBusinessHour('2026-03-29', 'Europe/London', 12)).toBe(Date.UTC(2026, 2, 29, 11))
  })
})
