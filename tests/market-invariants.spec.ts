import { describe, expect, it } from 'vitest'
import { compareMarketRatios, distributeMarketPool, marketBusinessHour } from '../src/domain/market.ts'

describe('independent market accounting invariants', () => {
  it('conserves every integer stick across varied multi-user pools', () => {
    let seed = 0x12345
    const random = (max: number): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max }
    for (let round = 0; round < 500; round += 1) {
      const positions = Array.from({ length: 2 + random(48) }, (_, i) => ({
        id: i + 1, side: (i === 0 ? 'long' : i === 1 ? 'short' : random(2) ? 'long' : 'short') as 'long' | 'short', count: 1 + random(1_000_000),
      }))
      const winner = random(2) ? 'long' : 'short'
      const payouts = distributeMarketPool(positions, winner)
      expect([...payouts.values()].reduce((sum, n) => sum + n, 0)).toBe(positions.reduce((sum, p) => sum + p.count, 0))
      const winners = positions.filter(p => p.side === winner)
      const pool = positions.filter(p => p.side !== winner).reduce((n, p) => n + p.count, 0)
      const winningStake = winners.reduce((n, p) => n + p.count, 0)
      for (const p of positions) {
        const paid = payouts.get(p.id)!
        expect(Number.isSafeInteger(paid)).toBe(true)
        expect(paid).toBeGreaterThanOrEqual(0)
        if (p.side !== winner) expect(paid).toBe(0)
        else {
          const base = p.count + Number(BigInt(p.count) * BigInt(pool) / BigInt(winningStake))
          expect(paid === base || paid === base + 1).toBe(true)
        }
      }
      expect([...distributeMarketPool(positions, null).values()]).toEqual(positions.map(p => p.count))
    }
  })

  it('compares exact vote fractions even when six-digit percentages look unchanged', () => {
    const base = { up_votes: 500_000_000, down_votes: 500_000_000 }
    expect(compareMarketRatios({ up_votes: 500_000_001, down_votes: 500_000_000 }, base)).toBe(1)
    expect(compareMarketRatios({ up_votes: 500_000_000, down_votes: 500_000_001 }, base)).toBe(-1)
    expect(compareMarketRatios({ up_votes: 1, down_votes: 1 }, base)).toBe(0)
    expect(compareMarketRatios({ up_votes: 0, down_votes: 0 }, base)).toBeNull()
  })

  it('keeps scheduled hours on the server business clock through daylight saving', () => {
    const before = marketBusinessHour('2026-03-28', 'Europe/London', 12)
    const after = marketBusinessHour('2026-03-29', 'Europe/London', 12)
    expect(after - before).toBe(23 * 60 * 60 * 1000)
    const winter = marketBusinessHour('2026-10-25', 'Europe/London', 12)
    const summer = marketBusinessHour('2026-10-24', 'Europe/London', 12)
    expect(winter - summer).toBe(25 * 60 * 60 * 1000)
  })
})
