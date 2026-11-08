import type { MarketBatch, MarketCandle, MarketPoint, MarketSide } from '../../shared/market-v1.ts'

export type PositionMood = 'waiting' | 'ahead' | 'behind' | 'even' | 'won' | 'lost' | 'returned'

/** Compare raw vote fractions; displayed, truncated percentages never settle a position. */
export function compareMarketPoints(current: MarketPoint | null, reference: MarketPoint | null): -1 | 0 | 1 | null {
  if (!current || !reference || current.case_id !== reference.case_id) return null
  const total = BigInt(current.up_votes) + BigInt(current.down_votes)
  const base = BigInt(reference.up_votes) + BigInt(reference.down_votes)
  if (total === 0n || base === 0n) return null
  const delta = BigInt(current.up_votes) * base - BigInt(reference.up_votes) * total
  return delta === 0n ? 0 : delta > 0n ? 1 : -1
}

export function pointRatio(point: MarketPoint | null): number | null {
  if (!point) return null
  const total = point.up_votes + point.down_votes
  return total > 0 ? point.up_votes / total : null
}

export function positionMood(batch: MarketBatch, current: MarketPoint | null): PositionMood {
  if (!batch.position) return 'waiting'
  if (batch.result === 'void' || batch.result === 'draw') return 'returned'
  if (batch.result !== null) return batch.result === batch.position.side ? 'won' : 'lost'
  const comparison = compareMarketPoints(current, batch.reference)
  if (comparison === null) return 'waiting'
  if (comparison === 0) return 'even'
  return (comparison > 0) === (batch.position.side === 'long') ? 'ahead' : 'behind'
}

/** This is a pool-share preview, not a linear mark-to-market profit. Final remainder allocation is server-only. */
export function expectedReturn(batch: MarketBatch, current: MarketPoint | null): number | null {
  const p = batch.position
  if (!p) return null
  if (p.payout !== null) return p.payout
  const mood = positionMood(batch, current)
  if (mood === 'waiting') return null
  if (mood === 'even' || mood === 'returned') return p.amount
  if (mood === 'behind' || mood === 'lost') return 0
  const own = p.side === 'long' ? batch.long_incense : batch.short_incense
  const other = p.side === 'long' ? batch.short_incense : batch.long_incense
  if (own <= 0 || other <= 0) return p.amount
  return p.amount + Number(BigInt(p.amount) * BigInt(other) / BigInt(own))
}

export function sideLabel(side: MarketSide): string { return side === 'long' ? '多' : '空' }

export function marketRatioLabel(ratio: number | null): string {
  return ratio === null ? '--' : `${(Math.trunc(ratio * 100_000_000) / 1_000_000).toFixed(6)}%`
}

export function chartRange(candles: readonly MarketCandle[], points: readonly (MarketPoint | null)[], source: 'ohlc' | 'close' = 'ohlc', displayedRatios: readonly number[] = []): { min: number, max: number } {
  const values: number[] = [...displayedRatios]
  for (const c of candles) {
    if (source === 'close') { if (c.close !== null) values.push(c.close) }
    else {
      if (c.low !== null) values.push(c.low)
      if (c.high !== null) values.push(c.high)
    }
  }
  for (const point of points) {
    const ratio = pointRatio(point)
    if (ratio !== null) values.push(ratio)
  }
  if (values.length === 0) return { min: 0, max: 1 }
  const low = Math.min(...values), high = Math.max(...values)
  const padding = Math.max(0.015, (high - low) * 0.18)
  return { min: Math.max(0, low - padding), max: Math.min(1, high + padding) }
}

export function marketTime(at: number, timezone: string): string {
  try { return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at) }
  catch { return '--:--' }
}

/** Keep a transient point label inside the plot, including narrow touch screens. */
export function marketTooltipPosition(point: { x: number; y: number; width: number; height: number }): { left: number; top: number; width: number } {
  const width = Math.min(216, Math.max(0, point.width - 16))
  return { width, left: Math.max(8, Math.min(point.width - width - 8, point.x + (point.x + width + 20 > point.width ? -width - 12 : 12))),
    top: Math.max(8, Math.min(point.height - 88, point.y >= 92 ? point.y - 84 : point.y + 12)) }
}
