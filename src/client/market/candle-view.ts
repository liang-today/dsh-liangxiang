import { MARKET_CANDLE_INTERVAL_MS, type MarketCandle, type MarketPoint } from '../../shared/market-v1.ts'
import { pointRatio } from './chart-model.ts'

/** A display bucket, never a settlement price or a replacement server candle. */
export interface MarketDisplayCandle extends MarketCandle {
  until: number
  samples: number
  confirmed_up: number
  confirmed_down: number
  unknown_volume: number
}

export interface MarketLatestChartPoint {
  at: number
  ratio: number
  source: 'candle' | 'snapshot' | 'close'
}

/** Latest plotted close uses its raw bucket end, never a display-bar midpoint or an older snapshot time. */
export function marketLatestChartPoint(candles: readonly MarketCandle[], observedAt: number, sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS, snapshot: MarketPoint | null = null, closePoint: MarketPoint | null = null): MarketLatestChartPoint | null {
  if (closePoint) {
    const ratio = pointRatio(closePoint)
    return ratio === null || closePoint.at > observedAt ? null : { at: closePoint.at, ratio, source: 'close' }
  }
  for (let index = candles.length - 1; index >= 0; index--) {
    const candle = candles[index]!
    if (candle.at > observedAt || candle.close === null) continue
    return { at: Math.min(candle.at + sourceIntervalMs, observedAt), ratio: candle.close, source: 'candle' }
  }
  const ratio = pointRatio(snapshot)
  return ratio === null || !snapshot || snapshot.at > observedAt ? null : { at: snapshot.at, ratio, source: 'snapshot' }
}

const priced = (c: MarketCandle): boolean => c.open !== null && c.high !== null && c.low !== null && c.close !== null

/**
 * Coarsen only adjacent official samples. A missing/null sample is a real break,
 * including when it falls inside one display bucket. Direction is reported only
 * when an adjacent cumulative-count delta exactly matches the official volume.
 */
export function marketDisplayCandles(candles: readonly MarketCandle[], intervalMs: number, origin: number, sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS): MarketDisplayCandle[] {
  const result: MarketDisplayCandle[] = []
  let previous: MarketCandle | undefined
  const interval = Math.max(sourceIntervalMs, intervalMs)
  for (const c of candles) {
    const deltaUp = previous ? c.up_votes - previous.up_votes : -1
    const deltaDown = previous ? c.down_votes - previous.down_votes : -1
    const known = previous !== undefined && previous.at + sourceIntervalMs === c.at && deltaUp >= 0 && deltaDown >= 0 && deltaUp + deltaDown === c.volume
    const up = known ? deltaUp : 0, down = known ? deltaDown : 0, unknown = known ? 0 : c.volume
    const bucket = Math.floor((c.at - origin) / interval)
    const last = result[result.length - 1]
    const joined = last && previous && priced(previous) && priced(c) && previous.at + sourceIntervalMs === c.at && Math.floor((last.at - origin) / interval) === bucket
    if (joined) {
      last.high = Math.max(last.high!, c.high!)
      last.low = Math.min(last.low!, c.low!)
      last.close = c.close
      last.until = c.at + sourceIntervalMs
      last.up_votes = c.up_votes; last.down_votes = c.down_votes
      last.volume += c.volume; last.samples += 1
      last.confirmed_up += up; last.confirmed_down += down; last.unknown_volume += unknown
    } else result.push({ ...c, until: c.at + sourceIntervalMs, samples: 1, confirmed_up: up, confirmed_down: down, unknown_volume: unknown })
    previous = c
  }
  return result
}

/** Automatic display density follows the viewport; it never invents a finer source. */
export function marketAutomaticInterval(span: number, plotWidth: number, sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS): number {
  const minute = 60_000
  const preferred = span <= 60 * minute ? minute : span <= 6 * 60 * minute ? 5 * minute
    : span / Math.max(1, Math.floor(plotWidth / 6)) <= 15 * minute ? 15 * minute : 30 * minute
  return Math.max(sourceIntervalMs, preferred)
}

/** Discrete zoom stops describe the actual viewport, including DST business days. */
export function marketZoomSpan(span: number, direction: 'in' | 'out', daySpan: number): number {
  const minute = 60_000
  const stops = [daySpan, 12 * 60 * minute, 6 * 60 * minute, 3 * 60 * minute, 60 * minute, 30 * minute]
    .filter((stop, index, all) => stop <= daySpan && all.indexOf(stop) === index)
  return direction === 'in' ? stops.find(stop => stop < span - 1) ?? stops[stops.length - 1]!
    : [...stops].reverse().find(stop => stop > span + 1) ?? daySpan
}

/** Wheel deltas are pixels, lines or pages; normalize before applying sensitivity. */
export function marketWheelPixels(deltaY: number, deltaMode: number, pageHeight: number, lineHeight = 16): number {
  if (!Number.isFinite(deltaY)) return 0
  return deltaY * (deltaMode === 1 ? Math.max(1, lineHeight) : deltaMode === 2 ? Math.max(1, pageHeight) : 1)
}

interface MarketChartWindow { from: number, until: number }

/** Continuous wheel zoom preserves the pointer's timestamp unless a day edge intervenes. */
export function marketWheelWindow(current: MarketChartWindow, deltaPixels: number, anchor: number, day: MarketChartWindow): MarketChartWindow {
  if (!Number.isFinite(deltaPixels) || Math.abs(deltaPixels) < .01) return current
  const previousSpan = current.until - current.from
  const daySpan = day.until - day.from
  const requested = previousSpan * Math.exp(Math.max(-.35, Math.min(.35, deltaPixels * .0015)))
  const span = requested >= daySpan - 1 ? daySpan : requested <= 1_800_001 ? 1_800_000 : requested
  if (span === previousSpan) return current
  const start = current.from + (previousSpan - span) * Math.max(0, Math.min(1, anchor))
  const from = Math.max(day.from, Math.min(day.until - span, start))
  return { from, until: from + span }
}

/** The range badge is a duration, never the candle grain or a stale preset. */
export function marketViewportLabel(span: number, daySpan: number): string {
  if (span === daySpan) return '今日'
  // Display at minute precision; never call an arbitrary wheel span a preset.
  const totalMinutes = Math.max(1, Math.floor((span + 1) / 60_000))
  const hours = Math.floor(totalMinutes / 60), minutes = totalMinutes % 60
  return `近${hours ? `${hours}时` : ''}${minutes ? `${minutes}分` : ''}`
}

/** Candles and volume marks are drawn at the same observed midpoint. */
export function marketViewportCandles(candles: readonly MarketDisplayCandle[], from: number, until: number, observedAt: number): MarketDisplayCandle[] {
  return candles.filter(candle => {
    if (candle.at > observedAt) return false
    const center = Math.min((candle.at + candle.until) / 2, observedAt)
    return center >= from && center <= until
  })
}
