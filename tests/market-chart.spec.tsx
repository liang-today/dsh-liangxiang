import { createRequire } from 'node:module'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { CandleLayer, MarketChart } from '../src/client/market/MarketChart.tsx'
import { marketAutomaticInterval, marketDisplayCandles, marketLatestChartPoint, marketViewportCandles, marketViewportLabel, marketWheelPixels, marketWheelWindow, marketZoomSpan } from '../src/client/market/candle-view.ts'
import { chartRange, marketTooltipPosition } from '../src/client/market/chart-model.ts'
import { marketBubbleLabel, marketTideSegments } from '../src/client/market/tide-model.ts'
import { marketBubbleDirection, marketDepthBands } from '../src/client/market/pond-model.ts'
import { LEGACY_LIANGZI_POLICY_VERSION, LIANGZI_POLICY_VERSION } from '../src/domain/liangzi.ts'
import type { MarketState } from '../src/shared/market-v1.ts'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup(element: ReactElement): string }
const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000
function state(): MarketState {
  const point = { case_id: 'market-chart-case', at: DAY + 19 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 }
  return { schema_version: 1, soft_trust: true, server_time: point.at, current_point: point,
    wallet: { available_incense: 20, frozen_incense: 20, total_incense: 40, token_remainder: 0, token_per_incense: 50_000, version: 1 },
    market: { id: 'market-chart', case_id: point.case_id, business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: ([1, 2, 3] as const).map(batch => ({ batch, opens_at: DAY + (batch === 1 ? 9 : batch === 2 ? 12 : 18) * HOUR, locks_at: DAY + (batch === 1 ? 11 : batch === 2 ? 17 : 20) * HOUR,
        reference_at: DAY + (batch === 1 ? 12 : batch === 2 ? 18 : 21) * HOUR, status: batch === 3 ? 'open' : 'live', reference: batch === 3 ? null : { ...point, up_votes: 50, down_votes: 50 },
        long_incense: 10, short_incense: 10, position: batch === 3 ? null : { side: batch === 1 ? 'long' : 'short', amount: 10, submitted_at: DAY + 10 * HOUR, payout: null }, result: null })) },
  }
}

describe('readable official market chart, independent of the header illustration', () => {
  it('keeps the chart footer out of the layout while preserving exact accessible amounts and Chinese batch names', () => {
    const candles = [{ at: DAY + 18 * HOUR, open: .4, high: .6, low: .3, close: .5, up_votes: 10, down_votes: 10, volume: 9_999_999 }]
    const html = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} />)
    expect(html).not.toContain('<figcaption')
    expect(html).not.toContain('chart-readout')
    expect(html).toContain('当前 55.000000%')
    expect(html).not.toContain('data-liangxiang-market-point-detail')
    expect(html).toContain('本段上香 9,999,999 炷')
    expect(html.match(/data-liangxiang-market-volume=""[^>]+/)![0]).toContain('本段上香 9,999,999 炷')
    expect(html).not.toContain('本场新增')
    for (const name of ['早盘', '午盘', '晚盘']) {
      expect(html).toContain(`${name}投入`)
      expect(html).toContain(`${name}锁仓定梁`)
    }
    expect(html).not.toContain('锁仓定线')
  })
  it('centres the directional legend in the same right-axis column, below the final price tick and beside the volume band', () => {
    const html = renderToStaticMarkup(<MarketChart state={state()} candles={[]} animated={false} />)
    const axes = html.match(/<g data-liangxiang-market-price-axis="">[\s\S]*?<\/g>/g)!
    const legend = html.match(/<g data-liangxiang-market-direction-legend=""[^>]*>[\s\S]*?<\/g>/)![0]
    const [centerX, centerY] = legend.match(/transform="translate\(([^,]+),([^)]+)\)"/)!.slice(1).map(Number) as [number, number]
    for (const axis of axes) {
      const label = axis.match(/<text[^>]*>/)![0]
      expect(Number(label.match(/\bx="([^"]+)"/)![1])).toBe(centerX)
      expect(label).toContain('text-anchor="middle"')
    }
    const lowest = Number(axes.at(-1)!.match(/<text[^>]*\by="([^"]+)"/)![1])
    expect(centerY).toBeGreaterThan(lowest + 11)
    expect(centerY + 7).toBeLessThan(272 - 16)
    expect(centerX - 26).toBeGreaterThan(760 - 64)
    expect(centerX + 27).toBeLessThan(760)
    expect(legend).toContain('量带：夯／拉')
    expect(legend).toContain('>夯</text>')
    expect(legend).toContain('>拉</text>')
  })
  it('places a bounded point tooltip on either side of mouse, keyboard and touch positions without escaping the plot', () => {
    for (const width of [240, 360, 760]) for (const height of [140, 272]) for (const x of [0, width / 2, width]) for (const y of [0, height / 2, height]) {
      const tip = marketTooltipPosition({ x, y, width, height })
      expect(tip.left).toBeGreaterThanOrEqual(8)
      expect(tip.left + tip.width).toBeLessThanOrEqual(width - 8)
      expect(tip.top).toBeGreaterThanOrEqual(8)
      expect(tip.top + 80).toBeLessThanOrEqual(height - 8)
    }
  })
  it('compacts BigInt bubble volume without inventing unknown directional counts', () => {
    const bubble = { at: DAY, until: DAY + HOUR, last_sample_at: DAY, ratio: .5, radius: 4, volume: 123_456_789n, up: null, down: null }
    expect(marketBubbleLabel(bubble, 'UTC')).toBe('00:00—01:00 · 本段上香 1.234亿 炷 · 方向明细未确认')
    expect(marketBubbleLabel({ ...bubble, up: 123_450_000n, down: 6_789n }, 'UTC')).toContain('夯 1.234亿 · 拉 6,789')
  })
  it('keeps a forming candle at or before the observation boundary', () => {
    const start = DAY + 10 * HOUR
    const candles = [{ at: start, open: .4, high: .5, low: .4, close: .5, up_votes: 10, down_votes: 10, volume: 0 }]
    for (const elapsed of [0, 30_000, 150_000, 180_000]) {
      const observedAt = start + elapsed
      const html = renderToStaticMarkup(<svg><CandleLayer candles={candles} from={DAY} until={DAY + 24 * HOUR} min={0} max={1} observedAt={observedAt} sourceIntervalMs={300_000} /></svg>)
      const x = Number(html.match(/data-liangxiang-market-candle-x="([^"]+)"/)![1])
      const displayedAt = DAY + (x - 12) / 684 * 24 * HOUR
      expect(displayedAt).toBeLessThanOrEqual(observedAt)
      expect(displayedAt).toBe(Math.min(start + 150_000, observedAt))
    }
  })

  it('draws only real upper and lower shadows with exact OHLC endpoints and a legible non-scaling stroke', () => {
    const candle = { at: DAY, open: .4, high: .8, low: .2, close: .6, up_votes: 6, down_votes: 4, volume: 1 }
    const render = (sample = candle) => renderToStaticMarkup(<svg><CandleLayer candles={[sample]} from={DAY} until={DAY + HOUR} min={0} max={1} observedAt={DAY + HOUR} /></svg>)
    const html = render()
    const upper = html.match(/<line data-liangxiang-market-wick="upper"[^>]*>/)![0]
    const lower = html.match(/<line data-liangxiang-market-wick="lower"[^>]*>/)![0]
    const y = (ratio: number) => 24 + (1 - ratio) * (214 - 24)
    for (const [line, first, last] of [[upper, .8, .6], [lower, .4, .2]] as const) {
      expect(Number(line.match(/y1="([^"]+)"/)![1])).toBeCloseTo(y(first))
      expect(Number(line.match(/y2="([^"]+)"/)![1])).toBeCloseTo(y(last))
      expect(line).toContain('stroke-width="1.6"')
      expect(line).toContain('vector-effect="non-scaling-stroke"')
    }
    expect(render({ ...candle, high: .6, low: .4 })).not.toContain('data-liangxiang-market-wick')
    expect(render({ ...candle, open: .5, close: .5, high: .5, low: .5 })).not.toContain('data-liangxiang-market-wick')
    const falling = render({ ...candle, open: .6, close: .4 })
    expect(falling).toContain('data-direction="down"')
    expect(falling.match(/data-liangxiang-market-wick=/g)).toHaveLength(2)
  })

  it('defaults to K lines, shows the complete business day and reserves future hours without inventing prices', () => {
    const s = state()
    const candles = [{ at: DAY + 10 * HOUR, open: .4, high: .5, low: .4, close: .5, up_votes: 10, down_votes: 10, volume: 0 }]
    const html = renderToStaticMarkup(<MarketChart state={s} candles={candles} animated={false} />)
    expect(html).toContain(`data-liangxiang-market-from="${DAY}"`)
    expect(html).toContain(`data-liangxiang-market-until="${DAY + 24 * HOUR}"`)
    for (const label of ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']) expect(html).toContain(`>${label}</text>`)
    expect(html).toContain('data-liangxiang-market-future=""')
    expect(html).toContain('待开梁')
    expect(html).toContain('data-liangxiang-market-chart-mode="candles"')
    expect(html).toContain('data-liangxiang-market-interval="900000"')
    expect(html).toContain('data-liangxiang-market-phase="before"')
    expect(html.match(/data-liangxiang-market-phase="open"/g)).toHaveLength(3)
    expect(html.match(/data-liangxiang-market-phase="locked"/g)).toHaveLength(3)
    expect(html).toContain('data-liangxiang-market-phase="closing"')
    expect(html).not.toContain('data-liangxiang-market-tide-area')
    expect(html.match(/data-liangxiang-market-candle=/g)).toHaveLength(1)
    expect(html).not.toContain('data-liangxiang-market-whale-art')
    s.server_time = DAY + 25 * HOUR
    expect(renderToStaticMarkup(<MarketChart state={s} candles={candles} animated={false} />)).not.toContain('data-liangxiang-market-future')
  })

  it('splits future time at the business clock rather than the last known candle and keeps phases as thin strips', () => {
    const s = state(), now = DAY + 13 * HOUR + 26 * 60_000
    s.server_time = now
    s.current_point = { ...s.current_point!, at: DAY + 10 * HOUR }
    s.market!.batches = s.market!.batches.map(batch => ({ ...batch, reference: null }))
    const candles = [10, 18].map(hour => ({ at: DAY + hour * HOUR, open: .4, high: .5, low: .4, close: .5, up_votes: 10, down_votes: 10, volume: 2 }))
    const html = renderToStaticMarkup(<MarketChart state={s} candles={candles} animated={false} />)
    const future = html.match(/<g data-liangxiang-market-future=""[^>]*>([\s\S]*?)<\/g>/)![1]!
    const boundary = html.match(/<line data-liangxiang-market-current-time=""[^>]*>/)![0]!
    const value = (markup: string, name: string) => Number(markup.match(new RegExp(`\\b${name}="([^"]+)"`))![1])
    const rect = future.match(/<rect[^>]*>/)![0]!, label = future.match(/<text[^>]*>/)![0]!
    const expectedX = 12 + (now - DAY) / (24 * HOUR) * 684
    expect(value(rect, 'x')).toBeCloseTo(expectedX)
    expect(value(boundary, 'x1')).toBeCloseTo(expectedX)
    expect(value(boundary, 'x2')).toBeCloseTo(expectedX)
    expect(value(boundary, 'data-at')).toBe(now)
    expect(boundary).not.toContain('stroke-dasharray')
    expect(value(label, 'x')).toBeCloseTo(expectedX + 8)
    expect(label).toContain('text-anchor="start"')
    expect(rect).toContain('fill="var(--liangxiang-market-future-bg, #edf0f3)"')
    expect(html.match(/data-liangxiang-market-candle=/g)).toHaveLength(1)
    expect(html.match(/<circle data-liangxiang-market-current-point=""[^>]*>/)![0]).toContain(`data-at="${DAY + 10 * HOUR + 60_000}"`)
    const phases = html.match(/<rect[^>]*data-liangxiang-market-phase=[^>]*>/g)!
    expect(phases).toHaveLength(8)
    expect(phases.every(phase => value(phase, 'height') === 3)).toBe(true)
  })

  it('shows only the time boundary for zero-vote future time, and no current marker on an elapsed business day', () => {
    const s = state()
    s.current_point = null
    s.market!.batches = s.market!.batches.map(batch => ({ ...batch, reference: null }))
    const empty = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} />)
    expect(empty).toContain('待开梁')
    expect(empty).toContain('data-liangxiang-market-current-time')
    expect(empty).not.toContain('data-liangxiang-market-current-point')
    expect(empty).not.toContain('50.000000%')
    s.server_time = DAY + 25 * HOUR
    const historical = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} />)
    expect(historical).not.toContain('data-liangxiang-market-current-time')
    expect(historical).not.toContain('data-liangxiang-market-future')
  })

  it('separates the four OHLC values and numeric price axis from decorative content', () => {
    const candles = [{ at: DAY + 18 * HOUR, open: .4, high: .6, low: .3, close: .5, up_votes: 10, down_votes: 10, volume: 4 }]
    const html = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} />)
    expect(html.match(/data-liangxiang-market-price-axis=/g)).toHaveLength(5)
    for (const [key, value] of [['open', '40.000000%'], ['high', '60.000000%'], ['low', '30.000000%'], ['close', '50.000000%']]) {
      const quote = html.match(new RegExp(`<b[^>]*data-liangxiang-market-quote="${key}"[^>]*>([^<]+)</b>`))
      expect(quote?.[1]).toBe(value)
      expect(quote?.[0]).toContain(`title="${value}"`)
    }
    expect(html).not.toContain('data-liangxiang-market-main-whale')
    expect(html).toContain('data-direction="unknown"')
    expect(html).not.toContain('liangxiang-market-volume-bubble')
  })

  it('uses one non-interactive range display instead of duplicate presets, reset buttons or a grain selector', () => {
    const minute = renderToStaticMarkup(<MarketChart state={state()} candles={[]} animated={false} candlesIntervalMs={60_000} />)
    expect(minute).toContain('<output class="liangxiang-market-chart-window" aria-label="走势时间范围" aria-live="off" title="00:00—24:00">今日</output>')
    expect(minute).toContain('class="liangxiang-market-chart-window"')
    expect(minute).not.toContain('↺')
    expect(minute).not.toContain('复位走势时间范围')
    expect(minute).not.toContain('点击复位')
    expect(minute).toContain('data-liangxiang-market-source-interval="60000"')
    expect(minute).not.toContain('分钟烛线')
    expect(minute).not.toContain('<select')
    expect(minute).not.toContain('近4时')
    const legacy = renderToStaticMarkup(<MarketChart state={state()} candles={[]} animated={false} candlesIntervalMs={300_000} />)
    expect(legacy).toContain('data-liangxiang-market-source-interval="300000"')
    expect(legacy).not.toContain('分钟烛线')
    expect(minute).not.toContain('<figcaption')
    expect(minute).not.toContain('量带高度看总量，分段看比例')
    expect(minute).not.toContain('官方记录 · 缺口不连线')
  })

  it('shows only the supplied supported case policy, including legacy boundaries', () => {
    expect(marketDepthBands()).toEqual([])
    expect(marketDepthBands('unknown-policy')).toEqual([])
    const current = marketDepthBands(LIANGZI_POLICY_VERSION)
    const legacy = marketDepthBands(LEGACY_LIANGZI_POLICY_VERSION)
    expect(current).toHaveLength(6)
    expect(current[0]).toMatchObject({ state: 'xiao_nan_liang', label: '小难梁', low: 0, high: .25 })
    expect(legacy).toHaveLength(5)
    expect(legacy[0]).toMatchObject({ state: 'liang_gong', label: '梁工', low: 0, high: .5 })
    const s = state()
    const hidden = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} liangziPolicyId="unknown-policy" />)
    expect(hidden).not.toContain('data-liangxiang-market-zone=')
    const shown = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} liangziPolicyId={LIANGZI_POLICY_VERSION} />)
    expect(shown).toContain('梁总')
    expect(shown).not.toContain('data-liangxiang-market-zone=')
  })

  it('colours directional bubbles only from a confirmed majority', () => {
    expect(marketBubbleDirection({ up: 10n, down: 2n })).toBe('up')
    expect(marketBubbleDirection({ up: 2n, down: 10n })).toBe('down')
    expect(marketBubbleDirection({ up: null, down: 10n })).toBeNull()
    expect(marketBubbleDirection({ up: 10n, down: null })).toBeNull()
    expect(marketBubbleDirection({ up: 10n, down: 10n })).toBeNull()
  })

  it('changes the selected reference without moving the official current price marker', () => {
    const s = state()
    const long = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} selectedBatch={1} />)
    const short = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} selectedBatch={2} />)
    const dot = (html: string): string | undefined => html.match(/<circle data-liangxiang-market-current-point=""[^>]+>/)?.[0]
    expect(dot(short)).toEqual(dot(long))
    expect(dot(long)).toBeDefined()
    expect(long).not.toContain('foreignObject')
  })

  it('places the latest marker at the forming raw-minute endpoint, independently of a stale snapshot and coarser display midpoint', () => {
    const minute = 60_000, start = DAY + 13 * HOUR, observed = start + 26 * minute + 20_000
    const raw = Array.from({ length: 27 }, (_, index) => ({ at: start + index * minute, open: .5, high: .6, low: .4, close: .5 + index / 1000, up_votes: 50, down_votes: 50, volume: 0 }))
    const s = state()
    s.server_time = observed
    s.current_point = { ...s.current_point!, at: start }
    const point = marketLatestChartPoint(raw, observed, minute, s.current_point)
    expect(point).toEqual({ at: observed, ratio: .526, source: 'candle' })
    expect(marketTideSegments(raw, observed, minute).at(-1)!.at(-1)).toEqual({ at: point!.at, ratio: point!.ratio })
    const grouped = marketDisplayCandles(raw, 15 * minute, DAY, minute).at(-1)!
    expect((grouped.at + grouped.until) / 2).toBeLessThan(point!.at)
    const html = renderToStaticMarkup(<MarketChart state={s} candles={raw} animated={false} candlesIntervalMs={minute} />)
    const marker = html.match(/<circle data-liangxiang-market-current-point=""[^>]+>/)![0]
    expect(marker).toContain(`data-at="${observed}"`)
    expect(marker).toContain('data-ratio="0.526"')
    expect(marker).toContain('data-source="candle"')
    expect(marker).toContain('最新行情 · 13:26')
    expect(Number(marker.match(/cx="([^"]+)"/)![1])).toBeCloseTo(12 + (observed - DAY) / (24 * HOUR) * 684)
  })

  it('does not move a completed record into an unrecorded tail, and respects the true legacy forming interval', () => {
    const minute = 60_000, start = DAY + 13 * HOUR, observed = start + 26 * minute + 20_000
    const last = { at: start + 25 * minute, open: .5, high: .6, low: .4, close: .6, up_votes: 60, down_votes: 40, volume: 0 }
    expect(marketLatestChartPoint([last], observed, minute)).toMatchObject({ at: start + 26 * minute, ratio: .6 })
    expect(marketLatestChartPoint([last], observed, 5 * minute)).toMatchObject({ at: observed, ratio: .6 })
    expect(marketLatestChartPoint([{ ...last, at: observed + minute }], observed, minute)).toBeNull()
    const snapshot = { ...state().current_point!, at: start, up_votes: 70, down_votes: 30 }
    expect(marketLatestChartPoint([], observed, minute, snapshot)).toEqual({ at: start, ratio: .7, source: 'snapshot' })
    const close = { ...snapshot, at: DAY + 24 * HOUR, up_votes: 80, down_votes: 20 }
    expect(marketLatestChartPoint([last], close.at, minute, snapshot, close)).toEqual({ at: close.at, ratio: .8, source: 'close' })
    expect(marketLatestChartPoint([last], close.at, minute, snapshot, { ...close, up_votes: 0, down_votes: 0 })).toBeNull()
    expect(chartRange([], [], 'ohlc', [.9])).toEqual({ min: .885, max: .915 })
  })

  it('leaves a zero-vote pond without an invented numeric water point', () => {
    const s = state()
    s.current_point = null
    s.market!.batches = s.market!.batches.map(batch => ({ ...batch, reference: null, position: null }))
    const html = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} />)
    expect(html).toContain('当前 --')
    expect(html).not.toContain('data-liangxiang-market-current-point')
    expect(html).not.toContain('50.000000%')
    expect(html).not.toContain('<image')
  })

  it('does not restore the retired recent preset when opening a chart', () => {
    const candles = [{ at: DAY, open: 0, high: 1, low: 0, close: 1, up_votes: 10, down_votes: 0, volume: 0 },
      { at: DAY + 18 * HOUR, open: .5, high: .51, low: .49, close: .5, up_votes: 10, down_votes: 10, volume: 0 }]
    const whole = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} />)
    const recent = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} recent />)
    expect(whole).toContain('>100.00%</text>')
    expect(recent).toEqual(whole)
  })
  it('renders real records before the trading window instead of treating 00–09 as missing history', () => {
    const candles = [2, 8, 10].map(hour => ({ at: DAY + hour * HOUR, open: .4, high: .5, low: .4, close: .5, up_votes: 10, down_votes: 10, volume: 0 }))
    const html = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} candlesIntervalMs={60_000} />)
    expect(html.match(/data-liangxiang-market-candle=/g)).toHaveLength(3)
    expect(html).toContain('data-liangxiang-market-phase="before"')
  })
})

describe('official candle display aggregation', () => {
  const STEP = 300_000
  const c = (at: number, open = .4, close = .5, up = 10, down = 10, volume = 0) => ({ at, open, close, high: Math.max(open, close) + .01, low: Math.min(open, close) - .01, up_votes: up, down_votes: down, volume })
  it('uses the first open, extrema and last close, retaining unknown volume instead of faking directions', () => {
    const grouped = marketDisplayCandles([c(0, .4, .5, 10, 10, 2), c(STEP, .5, .7, 13, 11, 4), c(STEP * 2, .7, .6, 14, 14, 4)], STEP * 3, 0, STEP)
    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({ at: 0, until: STEP * 3, samples: 3, open: .4, close: .6, high: .71, low: .39, volume: 10, confirmed_up: 4, confirmed_down: 4, unknown_volume: 2 })
  })
  it('does not combine across missing or null samples, including within one display bucket', () => {
    const gap = marketDisplayCandles([c(0), c(STEP * 2)], STEP * 3, 0, STEP)
    expect(gap).toHaveLength(2)
    const empty = { ...c(STEP), open: null, high: null, low: null, close: null }
    const nulls = marketDisplayCandles([c(0), empty, c(STEP * 2)], STEP * 3, 0, STEP)
    expect(nulls).toHaveLength(3)
    expect(nulls[1]!.close).toBeNull()
  })
  it('anchors groups to the actual business midnight and preserves total integer volume', () => {
    const origin = 12_345
    const candles = Array.from({ length: 12 }, (_, i) => c(origin + i * STEP, .4, .5, i + 10, i + 10, 2))
    const grouped = marketDisplayCandles(candles, STEP * 3, origin, STEP)
    expect(grouped.map(c => c.at)).toEqual([origin, origin + STEP * 3, origin + STEP * 6, origin + STEP * 9])
    expect(grouped.reduce((total, c) => total + c.volume, 0)).toBe(24)
    expect(grouped.reduce((total, c) => total + c.confirmed_up + c.confirmed_down + c.unknown_volume, 0)).toBe(24)
  })
  it('keeps a mismatching or decreasing cumulative delta neutral', () => {
    const grouped = marketDisplayCandles([c(0), c(STEP, .4, .5, 12, 12, 5), c(STEP * 2, .4, .5, 11, 12, 1)], STEP * 3, 0, STEP)
    expect(grouped[0]).toMatchObject({ volume: 6, confirmed_up: 0, confirmed_down: 0, unknown_volume: 6 })
  })
  it('coarsens real minute samples and cannot split a legacy five-minute candle', () => {
    const minute = 60_000
    const raw = [c(0), c(minute, .5, .6, 12, 11, 3), c(minute * 2, .6, .5, 13, 13, 3)]
    expect(marketDisplayCandles(raw, 5 * minute, 0, minute)).toMatchObject([{ at: 0, until: 3 * minute, samples: 3, volume: 6, confirmed_up: 3, confirmed_down: 3 }])
    const legacy = marketDisplayCandles([c(0)], minute, 0, STEP)
    expect(legacy).toHaveLength(1)
    expect(legacy[0]).toMatchObject({ at: 0, until: STEP, samples: 1 })
  })
  it('changes automatic density with zoom and actual plot width, bounded by the true source grain', () => {
    expect(marketAutomaticInterval(24 * HOUR, 684, 60_000)).toBe(900_000)
    expect(marketAutomaticInterval(24 * HOUR, 350, 60_000)).toBe(1_800_000)
    expect(marketAutomaticInterval(12 * HOUR, 350, 60_000)).toBe(900_000)
    expect(marketAutomaticInterval(4 * HOUR, 350, 60_000)).toBe(300_000)
    expect(marketAutomaticInterval(HOUR, 350, 60_000)).toBe(60_000)
    expect(marketAutomaticInterval(HOUR, 350, STEP)).toBe(STEP)
    expect(marketAutomaticInterval(HOUR / 2, 244, 60_000)).toBe(60_000)
  })
  it('zooms through true day / 12h / 6h / 3h / 1h / 30m spans and reports that same duration', () => {
    const stops = [24, 12, 6, 3, 1, .5].map(hours => hours * HOUR)
    const labels = ['今日', '近12时', '近6时', '近3时', '近1时', '近30分']
    for (let index = 0; index < stops.length; index++) {
      expect(marketViewportLabel(stops[index]!, 24 * HOUR)).toBe(labels[index])
      expect(marketZoomSpan(stops[index]!, 'in', 24 * HOUR)).toBe(stops[Math.min(index + 1, stops.length - 1)])
      expect(marketZoomSpan(stops[index]!, 'out', 24 * HOUR)).toBe(stops[Math.max(0, index - 1)])
    }
    for (const hours of [23, 25]) {
      expect(marketViewportLabel(hours * HOUR, hours * HOUR)).toBe('今日')
      expect(marketZoomSpan(hours * HOUR, 'in', hours * HOUR)).toBe(12 * HOUR)
      expect(marketZoomSpan(12 * HOUR, 'out', hours * HOUR)).toBe(hours * HOUR)
    }
    expect(marketViewportLabel(90 * 60_000, 24 * HOUR)).toBe('近1时30分')
    expect(marketViewportLabel(11 * HOUR + 36 * 60_000 + 45_000, 24 * HOUR)).toBe('近11时36分')
    expect(marketZoomSpan(11.6 * HOUR, 'in', 24 * HOUR)).toBe(6 * HOUR)
    expect(marketZoomSpan(11.6 * HOUR, 'out', 24 * HOUR)).toBe(12 * HOUR)
  })
  it('normalizes pixel, line and page wheel input without a DOM dependency', () => {
    expect(marketWheelPixels(-48, 0, 480)).toBe(-48)
    expect(marketWheelPixels(-3, 1, 480)).toBe(-48)
    expect(marketWheelPixels(-.1, 2, 480)).toBe(-48)
    expect(marketWheelPixels(-2, 1, 480, 20)).toBe(-40)
    expect(marketWheelPixels(Number.NaN, 0, 480)).toBe(0)
  })
  it('zooms continuously around the pointer, composes every small delta and reverses without snapping to presets', () => {
    const day = { from: DAY, until: DAY + 24 * HOUR }, anchor = .35
    const first = marketWheelWindow(day, -12, anchor, day)
    expect(first.until - first.from).toBeGreaterThan(23 * HOUR)
    expect(first.until - first.from).toBeLessThan(24 * HOUR)
    expect(first.until - first.from).toBeCloseTo(24 * HOUR * Math.exp(-12 * .0015), 2)
    expect(first.from + (first.until - first.from) * anchor).toBeCloseTo(DAY + 24 * HOUR * anchor, 2)
    const accumulated = Array.from({ length: 3 }).reduce<{ from: number, until: number }>(current => marketWheelWindow(current, -12, anchor, day), first)
    const combined = marketWheelWindow(day, -48, anchor, day)
    expect(accumulated.from).toBeCloseTo(combined.from, 2)
    expect(accumulated.until).toBeCloseTo(combined.until, 2)
    expect(marketWheelWindow(accumulated, 48, anchor, day)).toEqual(day)
    expect(marketWheelWindow(first, 0, anchor, day)).toBe(first)
  })
  it('bounds continuous wheel zoom at thirty minutes and the true 23/24/25-hour business day', () => {
    for (const hours of [23, 24, 25]) {
      const day = { from: DAY, until: DAY + hours * HOUR }
      const smallest = Array.from({ length: 30 }).reduce<{ from: number, until: number }>(current => marketWheelWindow(current, -1000, .5, day), day)
      expect(smallest.until - smallest.from).toBe(30 * 60_000)
      const largest = Array.from({ length: 30 }).reduce<{ from: number, until: number }>(current => marketWheelWindow(current, 1000, .5, day), smallest)
      expect(largest).toEqual(day)
      const left = marketWheelWindow({ from: day.from, until: day.from + HOUR }, 120, 0, day)
      expect(left.from).toBe(day.from)
      expect(left.until).toBeLessThanOrEqual(day.until)
      const right = marketWheelWindow({ from: day.until - HOUR, until: day.until }, 120, 1, day)
      expect(right.until).toBe(day.until)
      expect(right.from).toBeGreaterThanOrEqual(day.from)
    }
  })
  it('excludes offscreen bucket extremes when panning across a coarse-candle boundary', () => {
    const minute = 60_000
    const raw = Array.from({ length: 60 }, (_, i) => ({ ...c(i * minute, .5, .5), high: i < 15 ? 1 : i >= 30 ? .95 : .51 }))
    const coarse = marketDisplayCandles(raw, 15 * minute, 0, minute)
    const from = 14 * minute, until = 32 * minute, observedAt = 80 * minute
    const visible = marketViewportCandles(coarse, from, until, observedAt)
    expect(visible.map(candle => candle.at)).toEqual([15 * minute])
    expect(chartRange(coarse, []).max).toBe(1)
    expect(chartRange(visible, []).max).toBeLessThan(.6)
    const html = renderToStaticMarkup(<svg><CandleLayer candles={visible} from={from} until={until} min={.45} max={.55} observedAt={observedAt} /></svg>)
    expect(html.match(/data-liangxiang-market-candle=/g)).toHaveLength(1)
    const cx = Number(html.match(/data-liangxiang-market-candle-x="([^"]+)"/)![1])
    expect(cx).toBeGreaterThanOrEqual(12)
    expect(cx).toBeLessThanOrEqual(696)
  })
  it('uses the observed location of a forming candle without making a future candle visible', () => {
    const bars = marketDisplayCandles([c(60_000), c(120_000)], 60_000, 0, 60_000)
    expect(marketViewportCandles(bars, 64_000, 90_000, 65_000).map(c => c.at)).toEqual([60_000])
    expect(marketViewportCandles(bars, 66_000, 90_000, 65_000)).toEqual([])
  })
})
