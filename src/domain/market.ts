/** Integer-only rules for the daily community incense pools. */
export const MARKET_LEGACY_RULE_VERSION = 'liangxiang-market-v1' as const
export const MARKET_PREVIOUS_RULE_VERSION = 'liangxiang-market-v2' as const
export const MARKET_RULE_VERSION = 'liangxiang-market-v3' as const
export type MarketRuleVersion = typeof MARKET_LEGACY_RULE_VERSION | typeof MARKET_PREVIOUS_RULE_VERSION | typeof MARKET_RULE_VERSION

/** Business hours for new markets only; persisted batches always own their deadlines. */
export const MARKET_BATCH_HOURS = [[7, 11, 12], [12, 16, 17], [17, 21, 22]] as const

export function isMarketRuleVersion(value: unknown): value is MarketRuleVersion {
  return value === MARKET_LEGACY_RULE_VERSION || value === MARKET_PREVIOUS_RULE_VERSION || value === MARKET_RULE_VERSION
}

export type MarketDirection = 'long' | 'short'
export interface MarketCounts { up_votes: number, down_votes: number }
export interface PoolPosition { id: number, side: MarketDirection, count: number }

function count(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid market count')
  return BigInt(value)
}

/** Compare two raw ratios exactly, never their displayed/rounded percentages. */
export function compareMarketRatios(a: MarketCounts, b: MarketCounts): -1 | 0 | 1 | null {
  const au = count(a.up_votes)
  const at = au + count(a.down_votes)
  const bu = count(b.up_votes)
  const bt = bu + count(b.down_votes)
  if (at === 0n || bt === 0n) return null
  const difference = au * bt - bu * at
  return difference > 0n ? 1 : difference < 0n ? -1 : 0
}

export function validMarketReference(point: MarketCounts): boolean {
  return count(point.up_votes) > 0n && count(point.down_votes) > 0n
}

/**
 * Winner principal plus a proportional share of the losing pool. Largest
 * remainders receive the leftover WHOLE sticks; first position sequence wins
 * ties. All positions of an installation must already have been aggregated.
 */
export function distributeMarketPool(
  positions: readonly PoolPosition[],
  winner: MarketDirection | null,
): Map<number, number> {
  const payouts = new Map<number, number>()
  let long = 0n
  let short = 0n
  for (const position of positions) {
    const amount = count(position.count)
    if (payouts.has(position.id)) throw new Error('duplicate pool position')
    payouts.set(position.id, 0)
    if (position.side === 'long') long += amount
    else short += amount
  }
  if (winner === null || long === 0n || short === 0n) {
    for (const position of positions) payouts.set(position.id, position.count)
    return payouts
  }
  const winning = winner === 'long' ? long : short
  const losing = winner === 'long' ? short : long
  let allocated = 0n
  const remainders: Array<{ id: number, remainder: bigint }> = []
  for (const position of positions) {
    if (position.side !== winner || position.count === 0) continue
    const product = count(position.count) * losing
    const profit = product / winning
    const amount = count(position.count) + profit
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('market payout exceeds safe integer range')
    payouts.set(position.id, Number(amount))
    allocated += profit
    remainders.push({ id: position.id, remainder: product % winning })
  }
  remainders.sort((a, b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : a.id - b.id)
  const leftover = losing - allocated
  if (leftover > BigInt(remainders.length)) throw new Error('invalid market remainder')
  for (let i = 0; i < Number(leftover); i += 1) {
    const item = remainders[i]
    if (item === undefined) throw new Error('missing market remainder recipient')
    payouts.set(item.id, (payouts.get(item.id) ?? 0) + 1)
  }
  return payouts
}

/** Resolve an explicit local business hour without assuming a fixed UTC offset. */
export function marketBusinessHour(businessDate: string, timezone: string, hour: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || hour < 0 || hour > 23) throw new Error('invalid market schedule')
  const [year, month, day] = businessDate.split('-').map(Number)
  const target = Date.UTC(year!, month! - 1, day!, hour)
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  let candidate = target
  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(format.formatToParts(candidate).map(p => [p.type, p.value]))
    const actual = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second))
    const adjustment = target - actual
    if (adjustment === 0) return candidate
    candidate += adjustment
  }
  throw new Error('business hour cannot be represented')
}
