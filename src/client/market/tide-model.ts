import { MARKET_CANDLE_INTERVAL_MS, type MarketCandle } from '../../shared/market-v1.ts'
import { marketTime } from './chart-model.ts'
import { formatMarketIncense } from './market-presentation.ts'

export interface TideSample { at: number, ratio: number }
export interface TideGap { from: number, until: number }
export interface VolumeBubble {
  at: number
  until: number
  last_sample_at: number
  ratio: number
  volume: bigint
  up: bigint | null
  down: bigint | null
  radius: number
}

/** Completed closes live at the real bucket end; a forming close is never drawn in the future. */
export function marketTideSegments(candles: readonly MarketCandle[], observedAt: number, sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS): TideSample[][] {
  const result: TideSample[][] = []
  let current: TideSample[] = [], previousAt: number | null = null
  const flush = (): void => { if (current.length) result.push(current); current = [] }
  for (const candle of candles) {
    if (candle.at > observedAt) break
    if (candle.close === null) { flush(); previousAt = null; continue }
    if (previousAt !== null && candle.at !== previousAt + sourceIntervalMs) flush()
    current.push({ at: Math.min(candle.at + sourceIntervalMs, observedAt), ratio: candle.close })
    previousAt = candle.at
  }
  flush()
  return result
}

export function marketTideGaps(candles: readonly MarketCandle[], sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS): TideGap[] {
  const gaps: TideGap[] = []
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!, previous = candles[i - 1]
    if (previous && candle.at > previous.at + sourceIntervalMs) gaps.push({ from: previous.at + sourceIntervalMs, until: candle.at })
  }
  return gaps
}

/**
 * Shape-preserving cubic Hermite drawing through the official close samples.
 * Tangents are limited per interval so the decorative curve cannot overshoot
 * either endpoint. Tooltips and settlement still use the original samples.
 */
export function marketTidePath(samples: readonly TideSample[], project: (sample: TideSample) => { x: number, y: number }, bottom: number): { line: string, area: string } {
  if (samples.length === 0) return { line: '', area: '' }
  const points = samples.map(project)
  const first = points[0]!, last = points[points.length - 1]!
  const widths = points.slice(1).map((point, i) => point.x - points[i]!.x)
  const slopes = widths.map((width, i) => width > 0 ? (points[i + 1]!.y - points[i]!.y) / width : 0)
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0] ?? 0
    if (i === points.length - 1) return slopes[i - 1] ?? 0
    const before = slopes[i - 1]!, after = slopes[i]!
    if (before * after <= 0) return 0
    const previousWidth = widths[i - 1]!, nextWidth = widths[i]!
    const w1 = 2 * nextWidth + previousWidth, w2 = nextWidth + 2 * previousWidth
    return (w1 + w2) / (w1 / before + w2 / after)
  })
  for (let i = 0; i < slopes.length; i++) {
    const slope = slopes[i]!
    if (slope === 0) { tangents[i] = 0; tangents[i + 1] = 0; continue }
    const magnitude = Math.hypot(tangents[i]! / slope, tangents[i + 1]! / slope)
    if (magnitude > 3) {
      const factor = 3 / magnitude
      tangents[i] = factor * tangents[i]!
      tangents[i + 1] = factor * tangents[i + 1]!
    }
  }
  let line = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1]!, point = points[i]!, width = widths[i - 1]!
    // At an exact bucket boundary the completed and forming samples can share
    // a timestamp. Preserve both anchors without dividing by zero.
    if (width <= 0) { line += `L${point.x.toFixed(2)},${point.y.toFixed(2)}`; continue }
    const third = width / 3
    line += `C${(before.x + third).toFixed(2)},${(before.y + tangents[i - 1]! * third).toFixed(2)} ${
      (point.x - third).toFixed(2)},${(point.y - tangents[i]! * third).toFixed(2)} ${point.x.toFixed(2)},${point.y.toFixed(2)}`
  }
  return { line, area: samples.length < 2 ? '' : `${line}L${last.x.toFixed(2)},${bottom.toFixed(2)}L${first.x.toFixed(2)},${bottom.toFixed(2)}Z` }
}

/** At most 48 half-hour bubbles per day, sourced from accepted community volume only. */
export function marketVolumeBubbles(candles: readonly MarketCandle[], sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS): VolumeBubble[] {
  const windowMs = 30 * 60_000
  const groups = new Map<number, Omit<VolumeBubble, 'radius'>>()
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!
    if (candle.volume <= 0 || candle.close === null) continue
    const previous = candles[i - 1]
    let up: bigint | null = null, down: bigint | null = null
    if (!previous || previous.at + sourceIntervalMs === candle.at) {
      const u = BigInt(candle.up_votes) - BigInt(previous?.up_votes ?? 0), d = BigInt(candle.down_votes) - BigInt(previous?.down_votes ?? 0)
      if (u >= 0n && d >= 0n && u + d === BigInt(candle.volume)) { up = u; down = d }
    }
    const at = Math.floor(candle.at / windowMs) * windowMs
    const existing = groups.get(at)
    if (!existing) groups.set(at, { at, until: at + windowMs, last_sample_at: candle.at, ratio: candle.close, volume: BigInt(candle.volume), up, down })
    else {
      existing.volume += BigInt(candle.volume)
      existing.last_sample_at = candle.at; existing.ratio = candle.close
      existing.up = existing.up !== null && up !== null ? existing.up + up : null
      existing.down = existing.down !== null && down !== null ? existing.down + down : null
    }
  }
  return [...groups.values()].slice(-48).map(group => ({ ...group, radius: 3 + Math.sqrt(Number(group.volume > 121n ? 121n : group.volume)) }))
}

export function marketBubbleLabel(bubble: VolumeBubble, timezone: string): string {
  const detail = bubble.up === null || bubble.down === null ? '方向明细缺失' : `夯 ${formatMarketIncense(bubble.up)} · 拉 ${formatMarketIncense(bubble.down)}`
  return `${marketTime(bubble.at, timezone)}—${marketTime(bubble.until, timezone)} · 本段上香 ${formatMarketIncense(bubble.volume)} 炷 · ${detail}`
}
