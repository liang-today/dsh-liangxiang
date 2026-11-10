import { marketClass } from './market-motion-style.ts'
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'
import { MARKET_CANDLE_INTERVAL_MS, type MarketCandle, type MarketState, type MarketBatchId } from '../../shared/market-v1.ts'
import { PLUGIN_VERSION } from '../../shared/index.ts'
import { chartRange, marketRatioLabel, marketTime, marketTooltipPosition, pointRatio } from './chart-model.ts'
import { formatMarketIncense, marketBatchName } from './market-presentation.ts'
import { marketTideGaps, marketTidePath, marketTideSegments } from './tide-model.ts'
import { marketDepthBands } from './pond-model.ts'
import { createBusinessDateProvider } from '../../shared/business-date.ts'
import { marketDayDomain, marketTimeWindow } from './time-window.ts'
import { marketAutomaticInterval, marketDisplayCandles, marketLatestChartPoint, marketViewportCandles, marketViewportLabel, marketWheelPixels, marketWheelWindow, marketZoomSpan, type MarketDisplayCandle } from './candle-view.ts'


export const MARKET_WHALE_PATH = `/liangxiang/api/market/art.webp?v=${encodeURIComponent(PLUGIN_VERSION)}`
const WIDTH = 760, HEIGHT = 272, LEFT = 12, RIGHT = 64, TOP = 24
const INK = 'var(--liangxiang-market-blue, #4d6bfe)'
const LIGHT_INK = 'var(--liangxiang-market-chart-text, #8a8271)'
const PAPER = 'var(--liangxiang-market-paper, var(--dsw-alias-bg-layer-2, #fffcf5))'
const FUTURE = 'var(--liangxiang-market-future-bg, #edf0f3)'
const BORDER = 'var(--liangxiang-market-border, rgba(74, 72, 55, .18))'
const GOLD = 'var(--liangxiang-market-gold, #e2ae54)'
const VERMILION = 'var(--liangxiang-market-vermilion, #d2503f)'
const SLATE = 'var(--liangxiang-market-slate, #74839f)'
const MODE_KEY = 'liangxiang.market.chart-mode.v1'

interface ChartGeometry { width: number, bottom: number }
interface ChartViewport { scope: string, from: number, until: number }
export type MarketChartInteraction = 'mode-candles' | 'mode-tide' | 'zoom-in' | 'zoom-out' | 'pan' | 'inspect' | 'reset'
const geometry = (width = WIDTH, bottom = HEIGHT - 58): ChartGeometry => ({ width, bottom })
const midpoint = (candle: MarketCandle, observedAt: number, sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS): number => Math.min((candle.at + ('until' in candle ? (candle as MarketDisplayCandle).until : candle.at + sourceIntervalMs)) / 2, observedAt)
function chartProjection(layout: ChartGeometry, from: number, until: number, min: number, max: number) {
  const plot = layout.width - LEFT - RIGHT, duration = Math.max(1, until - from)
  return [
    (at: number): number => LEFT + (at - from) / duration * plot,
    (ratio: number): number => TOP + (max - ratio) / (max - min) * (layout.bottom - TOP),
    (span: number): number => Math.max(1.5, Math.min(14, span * .68 / duration * plot)),
  ] as const
}

export const CandleLayer = memo(function CandleLayer({ candles, from, until, min, max, observedAt, layout = geometry(), sourceIntervalMs = MARKET_CANDLE_INTERVAL_MS }: {
  candles: MarketCandle[], from: number, until: number, min: number, max: number, observedAt: number, layout?: ChartGeometry, sourceIntervalMs?: number,
}): ReactElement {
  const [x, y, candleWidth] = chartProjection(layout, from, until, min, max)
  return <g>{candles.map(candle => {
    if (candle.open === null || candle.close === null || candle.high === null || candle.low === null) return null
    const span = 'until' in candle ? (candle as MarketDisplayCandle).until - candle.at : sourceIntervalMs
    const width = candleWidth(span)
    const cx = x(midpoint(candle, observedAt, sourceIntervalMs)), rising = candle.close >= candle.open
    const color = rising ? VERMILION : SLATE
    const bodyHigh = Math.max(candle.open, candle.close), bodyLow = Math.min(candle.open, candle.close)
    const bodyTop = y(bodyHigh), bodyBottom = y(bodyLow), bodyHeight = Math.max(1, bodyBottom - bodyTop)
    return <g key={candle.at} data-liangxiang-market-candle="" data-direction={rising ? 'up' : 'down'} data-liangxiang-market-candle-x={cx}>
      {([['upper', candle.high, bodyHigh], ['lower', bodyLow, candle.low]] as const).map(([side, high, low]) => high > low && <line key={side} data-liangxiang-market-wick={side} x1={cx} x2={cx} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
      <rect x={cx - width / 2} y={(bodyTop + bodyBottom - bodyHeight) / 2} width={width} height={bodyHeight} fill={color} rx=".7" />
    </g>
  })}</g>
})

const TideLayer = memo(function TideLayer({ candles, from, until, min, max, observedAt, animated, layout, sourceIntervalMs }: {
  candles: MarketCandle[], from: number, until: number, min: number, max: number, observedAt: number, animated: boolean, layout: ChartGeometry, sourceIntervalMs: number,
}): ReactElement {
  const segments = useMemo(() => marketTideSegments(candles, observedAt, sourceIntervalMs), [candles, observedAt, sourceIntervalMs])
  const [x, y] = chartProjection(layout, from, until, min, max)
  return <g>{segments.map((segment, index) => {
    const path = marketTidePath(segment, point => ({ x: x(point.at), y: y(point.ratio) }), layout.bottom)
    const last = segment[segment.length - 1]!
    const textureId = `liangxiang-market-tide-texture-${index}-${segment[0]!.at}`
    const firstX = x(segment[0]!.at), span = x(last.at) - firstX
    const textureY = TOP + (layout.bottom - TOP) * .86
    return <g key={segment[0]!.at}>
      {path.area && <><path d={path.area} fill="url(#liangxiang-market-tide-fill)" data-liangxiang-market-tide-area="" /><path d={path.area} fill="url(#liangxiang-market-tide-sheen)" /><g className={marketClass('water-motion')} data-motion={animated} aria-hidden="true" pointerEvents="none"><defs><clipPath id={textureId}><path d={path.area} /></clipPath></defs><g clipPath={`url(#${textureId})`}><g className={marketClass('water-back')} fill="none" stroke="#b6dcff" strokeWidth="1.8" strokeLinecap="round" opacity=".32"><path d={`M${firstX - 26} ${textureY}Q${firstX + span * .2} ${textureY - 8} ${firstX + span * .47} ${textureY}T${firstX + span + 30} ${textureY}`} /></g></g></g></>}
      <path d={path.line} fill="none" stroke={INK} strokeOpacity=".1" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path.line} fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" data-liangxiang-market-tide-segment={index} />
      <circle data-liangxiang-market-tide-end="" data-at={last.at} cx={x(last.at)} cy={y(last.ratio)} r="2" fill={INK} />
    </g>
  })}</g>
})

function initialMode(): 'tide' | 'candles' {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(MODE_KEY) === 'tide' ? 'tide' : 'candles' } catch { return 'candles' }
}

export const MarketChart = memo(function MarketChart({ state, candles, animated, selectedBatch, liangziPolicyId, onInteraction, candlesIntervalMs = MARKET_CANDLE_INTERVAL_MS }: {
  state: MarketState, candles: MarketCandle[], animated: boolean, recent?: boolean, selectedBatch?: MarketBatchId, liangziPolicyId?: string, onInteraction?: (action: MarketChartInteraction, gesture?: boolean, range?: string) => void, onRecentChange?: (recent: boolean) => void, candlesIntervalMs?: number,
}): ReactElement {
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [mode, setMode] = useState<'tide' | 'candles'>(initialMode)
  const [special, setSpecial] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; width: number; height: number; keyboard?: boolean } | null>(null)
  const [size, setSize] = useState({ width: WIDTH, height: HEIGHT })
  const [viewport, setViewport] = useState<ChartViewport | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number, x: number, from: number, until: number, moved: boolean } | null>(null)
  const skipClick = useRef(false)
  const wheel = useRef<((event: globalThis.WheelEvent) => void) | null>(null)
  const wheelFeedback = useRef<number | null>(null)
  const wheelViewport = useRef<ChartViewport | null>(null)
  const wheelFrame = useRef<number | null>(null)
  const stopWheel = (): void => {
    if (wheelFrame.current !== null) window.cancelAnimationFrame(wheelFrame.current)
    window.clearTimeout(wheelFeedback.current ?? undefined)
    wheelFrame.current = null; wheelViewport.current = null; wheelFeedback.current = null
  }
  useEffect(() => {
    const element = box.current
    if (!element) return
    const measure = (): void => {
      const bounds = element.getBoundingClientRect()
      const next = { width: Math.max(240, Math.round(bounds.width)), height: Math.max(110, Math.round(bounds.height)) }
      setSize(old => old.width === next.width && old.height === next.height ? old : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const onWheel = (event: globalThis.WheelEvent): void => wheel.current?.(event)
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => { observer.disconnect(); element.removeEventListener('wheel', onWheel); stopWheel() }
  }, [])
  const market = state.market
  const timezone = market?.timezone ?? 'UTC'
  const dates = useMemo(() => createBusinessDateProvider(timezone), [timezone])
  const businessDate = market?.business_date ?? dates.businessDateOf(state.server_time)
  const day = useMemo(() => marketDayDomain(businessDate, timezone), [businessDate, timezone])
  const base = marketTimeWindow(day, state.server_time, timezone)
  const scope = `${market?.case_id ?? businessDate}:${day.from}`
  useEffect(() => { stopWheel() }, [scope])
  const { from, until } = viewport?.scope === scope ? viewport : base
  const observedUntil = base.observedUntil
  const futureFrom = observedUntil < until ? Math.max(from, observedUntil) : null
  const currentTimeInRange = state.server_time >= from && state.server_time < until
  const ticks = from === day.from && until === day.until ? day.ticks : Array.from({ length: 5 }, (_, index) => {
    const at = from + (until - from) * index / 4
    return { at, label: at === day.until ? '24:00' : marketTime(at, timezone) }
  })
  const interval = marketAutomaticInterval(until - from, size.width - LEFT - RIGHT, candlesIntervalMs)
  const viewportLabel = marketViewportLabel(until - from, day.until - day.from)
  const display = useMemo(() => marketDisplayCandles(candles.filter(c => c.at <= observedUntil), interval, day.from, candlesIntervalMs), [candles, observedUntil, interval, day.from, candlesIntervalMs])
  const visible = useMemo(() => marketViewportCandles(display, from, until, observedUntil), [display, from, until, observedUntil])
  const rawVisible = useMemo(() => candles.filter(c => c.at + candlesIntervalMs > from && c.at < until && c.at <= observedUntil), [candles, from, until, observedUntil, candlesIntervalMs])
  const gaps = useMemo(() => marketTideGaps(candles, candlesIntervalMs).filter(gap => gap.until > from && gap.from < observedUntil).map(gap => ({ from: Math.max(from, gap.from), until: Math.min(observedUntil, gap.until) })), [candles, from, observedUntil, candlesIntervalMs])
  const points = useMemo(() => [market?.close_point ?? state.current_point, ...(market?.batches.map(batch => batch.reference) ?? [])].filter(point => point && point.at >= from && point.at <= until && point.at <= observedUntil), [market, state.current_point, from, until, observedUntil])
  const latest = useMemo(() => marketLatestChartPoint(candles, observedUntil, candlesIntervalMs, state.current_point, market?.close_point), [candles, observedUntil, candlesIntervalMs, state.current_point, market?.close_point])
  const latestInRange = latest !== null && latest.at >= from && latest.at <= until
  const latestLabel = latest ? `${latest.source === 'close' ? '收盘梁位' : latest.source === 'snapshot' ? '当前快照' : '最新行情'} · ${marketTime(latest.at, timezone)} · ${marketRatioLabel(latest.ratio)}` : ''
  const range = useMemo(() => chartRange(mode === 'tide' ? rawVisible : visible, points, mode === 'tide' ? 'close' : 'ohlc', latestInRange ? [latest.ratio] : []), [rawVisible, visible, points, mode, latest, latestInRange])
  const layout = geometry(size.width, size.height - 58)
  const plotWidth = size.width - LEFT - RIGHT, plotHeight = layout.bottom - TOP
  const volumeY = layout.bottom + 12, volumeHeight = 20
  const [x, y, candleWidth] = chartProjection(layout, from, until, range.min, range.max)
  const current = pointRatio(market?.close_point ?? state.current_point)
  const bands = useMemo(() => marketDepthBands(liangziPolicyId), [liangziPolicyId])
  const activeBand = current === null ? undefined : bands.find(band => current >= band.low && (current < band.high || (band.high === 1 && current === 1)))
  const selectedAt = pinned ?? hover
  const selected = visible.find(c => c.at === selectedAt) ?? visible[visible.length - 1]
  const maxVolume = Math.max(1, ...visible.map(c => c.volume))
  const selectedTime = selected ? `${marketTime(selected.at, timezone)}—${marketTime(Math.min(selected.until, observedUntil), timezone)}` : ''
  const fullSelectedCopy = selected ? `${selectedTime} · 本段上香 ${selected.volume.toLocaleString('zh-CN')} 炷 · 夯 ${selected.confirmed_up.toLocaleString('zh-CN')} · 拉 ${selected.confirmed_down.toLocaleString('zh-CN')}${selected.unknown_volume ? ` · 其中 ${selected.unknown_volume.toLocaleString('zh-CN')} 炷方向明细缺失` : ''}` : '暂时没有官方行情'
  const readout = special ?? fullSelectedCopy
  const clampWindow = (start: number, span: number): { from: number, until: number } => {
    const width = Math.min(day.until - day.from, Math.max(1_800_000, span))
    const first = Math.max(day.from, Math.min(day.until - width, start))
    return { from: first, until: first + width }
  }
  const changeWindow = (start: number, span: number): void => {
    stopWheel()
    setViewport({ scope, ...clampWindow(start, span) }); setPinned(null); setHover(null); setSpecial(null); setTip(null)
  }
  const zoom = (direction: 'in' | 'out'): void => {
    const span = marketZoomSpan(until - from, direction, day.until - day.from)
    if (span === until - from) return
    const center = selectedAt !== null && selected ? midpoint(selected, observedUntil, candlesIntervalMs)
      : observedUntil >= from && observedUntil <= until ? observedUntil : (from + until) / 2
    changeWindow(center - span / 2, span)
    onInteraction?.(direction === 'in' ? 'zoom-in' : 'zoom-out', false, marketViewportLabel(span, day.until - day.from))
  }
  const resetWindow = (): void => { stopWheel(); setViewport(null); setPinned(null); setHover(null); setSpecial(null); setTip(null); onInteraction?.('reset') }
  wheel.current = event => {
    const element = box.current
    if (!element) return
    const bounds = element.getBoundingClientRect()
    const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight) || 16
    const delta = marketWheelPixels(event.deltaY, event.deltaMode, bounds.height, lineHeight)
    if (Math.abs(delta) < .01) return
    event.preventDefault()
    const anchor = Math.max(0, Math.min(1, ((event.clientX - bounds.left) / bounds.width * size.width - LEFT) / plotWidth))
    const current = wheelViewport.current?.scope === scope ? wheelViewport.current : { scope, from, until }
    const next = marketWheelWindow(current, delta, anchor, day)
    if (next === current) return
    wheelViewport.current = { scope, ...next }
    if (wheelFrame.current === null) wheelFrame.current = window.requestAnimationFrame(() => {
      wheelFrame.current = null
      const pending = wheelViewport.current
      if (!pending || pending.scope !== scope) return
      setViewport(pending); setPinned(null); setHover(null); setSpecial(null); setTip(null)
    })
    window.clearTimeout(wheelFeedback.current ?? undefined)
    wheelFeedback.current = window.setTimeout(() => {
      wheelFeedback.current = null
      const final = wheelViewport.current
      if (final?.scope === scope) onInteraction?.(delta < 0 ? 'zoom-in' : 'zoom-out', true, marketViewportLabel(final.until - final.from, day.until - day.from))
    }, 180)
  }
  const hit = (event: PointerEvent<SVGSVGElement>): number | null => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const at = from + ((event.clientX - bounds.left) / bounds.width * size.width - LEFT) / plotWidth * (until - from)
    if (at < from || at > until) return null
    if (futureFrom !== null && at > futureFrom) { setSpecial('待开梁 · 等香火慢慢落下'); return null }
    const gap = gaps.find(g => at >= g.from && at < g.until)
    if (gap || !rawVisible.some(c => at >= c.at && at < c.at + candlesIntervalMs)) { setSpecial(`${marketTime(at, timezone)} · 这段未记录，走势不连线`); return null }
    setSpecial(null)
    let nearest = visible[0]
    for (const candle of visible) if (!nearest || Math.abs(midpoint(candle, observedUntil, candlesIntervalMs) - at) < Math.abs(midpoint(nearest, observedUntil, candlesIntervalMs) - at)) nearest = candle
    return nearest?.at ?? null
  }
  const move = (event: PointerEvent<SVGSVGElement>): void => {
    const gesture = drag.current
    if (gesture) {
      if (gesture.pointer !== event.pointerId) return
      event.preventDefault()
      const offset = event.clientX - gesture.x
      if (Math.abs(offset) > 3) gesture.moved = true
      if (gesture.moved) changeWindow(gesture.from - offset / Math.max(1, event.currentTarget.getBoundingClientRect().width) * size.width / plotWidth * (gesture.until - gesture.from), gesture.until - gesture.from)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const local = (event.clientX - bounds.left) / bounds.width * size.width
    if (local < LEFT || local > size.width - RIGHT) { setTip(null); return }
    if (pinned === null) setHover(hit(event))
    setTip({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, width: bounds.width, height: bounds.height })
  }
  const key = (event: KeyboardEvent<SVGSVGElement>): void => {
    if (event.key === 'Escape' && pinned !== null) { stopWheel(); event.preventDefault(); event.stopPropagation(); setPinned(null); setHover(null); setSpecial(null); setTip(null); return }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', '+', '-', '=', '0'].includes(event.key)) return
    stopWheel()
    event.preventDefault(); event.stopPropagation()
    if (event.key === '+' || event.key === '=') { zoom('in'); return }
    if (event.key === '-') { zoom('out'); return }
    if (event.key === '0') { resetWindow(); return }
    if (!visible.length) return
    const index = Math.max(0, visible.findIndex(c => c.at === (selectedAt ?? selected?.at)))
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))
    setHover(visible[next]!.at); setPinned(null); setSpecial(null); onInteraction?.('inspect')
    const bounds = event.currentTarget.getBoundingClientRect()
    setTip({ x: x(midpoint(visible[next]!, observedUntil, candlesIntervalMs)) / size.width * bounds.width, y: 32, width: bounds.width, height: bounds.height, keyboard: true })
  }
  const selectMode = (next: 'tide' | 'candles'): void => {
    if (next === mode) return
    stopWheel()
    setMode(next); setTip(null); onInteraction?.(next === 'candles' ? 'mode-candles' : 'mode-tide')
    try { window.localStorage.setItem(MODE_KEY, next) } catch { /* Cosmetic preference is optional. */ }
  }
  return <figure className={marketClass('chart')} data-animated={animated} data-liangxiang-market-chart-mode={mode} style={{ margin: 0 }}>
    <div className={marketClass('chart-toolbar')}>
      <div role="group" aria-label="走势画法"><button type="button" aria-pressed={mode === 'candles'} data-selected={mode === 'candles'} onClick={() => selectMode('candles')}>K 线</button><button type="button" aria-pressed={mode === 'tide'} data-selected={mode === 'tide'} onClick={() => selectMode('tide')}>潮汐</button></div>
      <div className={marketClass('chart-zoom')} role="group" aria-label="图表缩放"><button type="button" aria-label="缩小走势" disabled={until - from >= day.until - day.from} onClick={() => zoom('out')}>−</button><button type="button" aria-label="放大走势" disabled={until - from <= 1_800_000} onClick={() => zoom('in')}>＋</button></div>
      <div className={marketClass('chart-range')} role="group" aria-label="走势时间范围">
        <output className={marketClass('chart-window')} aria-label="走势时间范围" aria-live="off"
          title={`${marketTime(from, timezone)}—${until === day.until ? '24:00' : marketTime(until, timezone)}`}>{viewportLabel}</output>
      </div>
    </div>
    <div className={marketClass('chart-quotes')} aria-label="所选行情开高低收">
      {(['open', 'high', 'low', 'close'] as const).map((key, i) => {
        const ratio = selected?.[key] ?? null
        const exact = marketRatioLabel(ratio)
        const label = size.width < 340 && ratio !== null ? `${(Math.trunc(ratio * 1_000_000) / 10_000).toFixed(4)}%` : exact
        return <div key={key}><span>{['开', '高', '低', '收'][i]}</span><b data-liangxiang-market-quote={key} aria-label={exact} title={exact}>{label}</b></div>
      })}
      <div className={marketClass('chart-quote-time')}><span>{pinned === null ? '选中时刻' : '已固定'}</span><b>{selected ? marketTime(selected.at, timezone) : '--:--'}</b></div>
    </div>
    <div className={marketClass('chart-scroll')} ref={box}>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" tabIndex={0} data-liangxiang-market-from={from} data-liangxiang-market-until={until} data-liangxiang-market-interval={interval} data-liangxiang-market-source-interval={candlesIntervalMs} data-liangxiang-market-pinned={pinned !== null}
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'hidden', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
        aria-label={`今日梁位${mode === 'tide' ? '潮汐' : 'K线'}，当前 ${marketRatioLabel(current)}${activeBand ? `，${activeBand.label}` : ''}。左右键查看官方行情，加减号或滚轮缩放，拖动平移，0或双击复位，点击固定，Escape解除固定；缺口不连线。${readout}`}
        onPointerMove={move} onPointerDown={event => { if (event.button !== 0 || drag.current) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); stopWheel(); setTip(null); skipClick.current = false; drag.current = { pointer: event.pointerId, x: event.clientX, from, until, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerUp={event => { if (drag.current?.pointer !== event.pointerId) return; if (drag.current.moved) { skipClick.current = true; onInteraction?.('pan') } drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onPointerCancel={event => { if (drag.current?.pointer !== event.pointerId) return; stopWheel(); drag.current = null; skipClick.current = true }}
        onLostPointerCapture={event => { if (drag.current?.pointer === event.pointerId) { drag.current = null; skipClick.current = true } }} onDragStart={event => event.preventDefault()}
        onDoubleClick={resetWindow}
        onClick={event => { if (skipClick.current) { skipClick.current = false; return } const at = hit(event as unknown as PointerEvent<SVGSVGElement>); if (at !== null) { setPinned(old => old === at ? null : at); setHover(at); onInteraction?.('inspect') } move(event as unknown as PointerEvent<SVGSVGElement>) }}
        onPointerLeave={() => { setTip(null); if (!drag.current && pinned === null) { setHover(null); setSpecial(null) } }} onBlur={() => setTip(null)} onKeyDown={key}>
        <defs>
          <clipPath id="liangxiang-market-price-clip"><rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} /></clipPath>
          <clipPath id="liangxiang-market-volume-clip"><rect x={LEFT} y={volumeY - 3} width={plotWidth} height={volumeHeight + 6} /></clipPath>
          <linearGradient id="liangxiang-market-tide-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--liangxiang-market-water-top, #4d6bfe)" stopOpacity=".36" /><stop offset="1" stopColor="var(--liangxiang-market-water-bottom, #4d6bfe)" stopOpacity=".08" /></linearGradient>
          <linearGradient id="liangxiang-market-tide-sheen" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <pattern id="liangxiang-market-gap-fill" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><path d="M0 0V10" stroke={LIGHT_INK} strokeOpacity=".2" strokeWidth="2" /></pattern>
        </defs>
        {futureFrom !== null && <g data-liangxiang-market-future="" data-at={futureFrom} role="img" aria-label="待开梁：当前时间之后，不绘制未来走势">
          <rect x={x(futureFrom)} y={TOP} width={Math.max(0, x(until) - x(futureFrom))} height={volumeY + volumeHeight - TOP} fill={FUTURE} />
          {x(until) - x(futureFrom) >= 50 && <text x={x(futureFrom) + 8} y={TOP + Math.min(22, plotHeight - 3)} fill={LIGHT_INK} fontSize="11" textAnchor="start" paintOrder="stroke" stroke={FUTURE} strokeWidth="4" strokeLinejoin="round">待开梁</text>}
        </g>}
        {Array.from({ length: size.height < 190 ? 3 : 5 }, (_, index) => {
          const ratio = range.max - (range.max - range.min) * index / (size.height < 190 ? 2 : 4), cy = y(ratio)
          return <g key={index} data-liangxiang-market-price-axis=""><line x1={LEFT} x2={LEFT + plotWidth} y1={cy} y2={cy} stroke={BORDER} strokeWidth=".8" /><text x={size.width - RIGHT / 2} y={cy + 4} textAnchor="middle" fill={LIGHT_INK} fontSize="11">{(ratio * 100).toFixed(2)}%</text></g>
        })}
        {currentTimeInRange && <line data-liangxiang-market-current-time="" data-at={state.server_time} role="img" aria-label={`当前时间 ${marketTime(state.server_time, timezone)}`} x1={x(state.server_time)} x2={x(state.server_time)} y1={TOP} y2={volumeY + volumeHeight} stroke={LIGHT_INK} strokeWidth="1" strokeOpacity=".45" vectorEffect="non-scaling-stroke" />}
        <g clipPath="url(#liangxiang-market-price-clip)">
          {market && [
            { from: day.from, until: market.batches[0]!.opens_at, kind: 'before', label: '开盘前' },
            ...market.batches.flatMap(batch => [{ from: batch.opens_at, until: batch.locks_at, kind: 'open', label: `${marketBatchName(batch.batch)}投入` }, { from: batch.locks_at, until: batch.reference_at, kind: 'locked', label: `${marketBatchName(batch.batch)}锁仓定梁` }]),
            { from: market.batches[2]!.reference_at, until: day.until, kind: 'closing', label: '尾盘打梁' },
          ].filter(phase => phase.until > from && phase.from < until).map(phase => <rect key={`${phase.kind}-${phase.from}`} data-liangxiang-market-phase={phase.kind} role="img" aria-label={`${phase.label}：${marketTime(phase.from, timezone)}—${phase.until === day.until ? '24:00' : marketTime(phase.until, timezone)}`} x={x(Math.max(from, phase.from))} y={TOP} width={Math.max(0, x(Math.min(until, phase.until)) - x(Math.max(from, phase.from)))} height="3" fill={phase.kind === 'open' ? INK : phase.kind === 'locked' ? GOLD : SLATE} fillOpacity={phase.kind === 'open' ? '.3' : phase.kind === 'locked' ? '.24' : '.12'} />)}
          {gaps.map(gap => <g key={gap.from} role="img" aria-label="此段未记录，走势不连线"><rect x={x(gap.from)} y={TOP} width={Math.max(0, x(gap.until) - x(gap.from))} height={plotHeight} fill="url(#liangxiang-market-gap-fill)" data-liangxiang-market-gap="" />{x(gap.until) - x(gap.from) >= 45 && <text x={(x(gap.from) + x(gap.until)) / 2} y={TOP + 18} textAnchor="middle" fill={LIGHT_INK} fontSize="11">未记录</text>}</g>)}
          {mode === 'tide' ? <TideLayer candles={rawVisible} from={from} until={until} min={range.min} max={range.max} observedAt={observedUntil} animated={animated} layout={layout} sourceIntervalMs={candlesIntervalMs} /> : <CandleLayer candles={visible} from={from} until={until} min={range.min} max={range.max} observedAt={observedUntil} layout={layout} sourceIntervalMs={candlesIntervalMs} />}
          {market?.batches.map(batch => {
            if (batch.reference_at < from || batch.reference_at > until) return null
            const reference = pointRatio(batch.reference), cx = x(batch.reference_at)
            return <g key={batch.batch} data-liangxiang-market-reference={batch.batch}><line x1={cx} x2={cx} y1={TOP} y2={layout.bottom} stroke={INK} strokeDasharray="3 5" opacity={batch.batch === selectedBatch ? '.3' : '.14'} />{reference !== null && batch.reference_at <= observedUntil && <circle cx={cx} cy={y(reference)} r={batch.batch === selectedBatch ? '3.5' : '2.5'} fill={INK} stroke={PAPER} strokeWidth="1.3" />}</g>
          })}
          {latest && latestInRange && <circle data-liangxiang-market-current-point="" data-at={latest.at} data-ratio={latest.ratio} data-source={latest.source} cx={x(latest.at)} cy={y(latest.ratio)} r="3" fill={GOLD} stroke={PAPER} strokeWidth="1.4" role="img" aria-label={latestLabel}><title>{latestLabel}</title></circle>}
          {selected && (hover !== null || pinned !== null) && <line x1={x(midpoint(selected, observedUntil, candlesIntervalMs))} x2={x(midpoint(selected, observedUntil, candlesIntervalMs))} y1={TOP} y2={layout.bottom} stroke={INK} strokeDasharray="2 3" opacity=".6" />}
        </g>
        {market?.batches.filter(batch => batch.reference_at >= from && batch.reference_at <= until).map(batch => <text key={batch.batch} x={x(batch.reference_at)} y="15" textAnchor="middle" fill={LIGHT_INK} fontSize="11">{marketBatchName(batch.batch)}{size.width < 560 ? '' : ` · ${marketTime(batch.reference_at, timezone)}定梁`}</text>)}
        <g clipPath="url(#liangxiang-market-volume-clip)">{visible.filter(c => c.volume > 0).map(c => {
          const cx = x(midpoint(c, observedUntil, candlesIntervalMs)), h = c.volume / maxVolume * volumeHeight
          const width = candleWidth(c.until - c.at)
          const upH = h * c.confirmed_up / c.volume, downH = h * c.confirmed_down / c.volume
          return <g key={c.at} className={marketClass('volume-band')} data-liangxiang-market-volume="" role="img" aria-label={`${marketTime(c.at, timezone)} · 本段上香 ${c.volume.toLocaleString('zh-CN')} 炷 · 夯 ${c.confirmed_up} · 拉 ${c.confirmed_down}${c.unknown_volume ? ` · 方向明细缺失 ${c.unknown_volume}` : ''}`}>
            {upH > 0 && <rect data-direction="up" x={cx - width / 2} y={volumeY + volumeHeight - h} width={width} height={upH} rx=".7" fill={VERMILION} />}
            {downH > 0 && <rect data-direction="down" x={cx - width / 2} y={volumeY + volumeHeight - h + upH} width={width} height={downH} rx=".7" fill={SLATE} />}
            {c.unknown_volume > 0 && <rect data-direction="unknown" x={cx - width / 2} y={volumeY + volumeHeight - h + upH + downH} width={width} height={Math.max(0, h - upH - downH)} rx=".7" fill={LIGHT_INK} opacity=".5" />}
            <rect x={cx - Math.max(3, width / 2)} y={volumeY - 3} width={Math.max(6, width)} height={volumeHeight + 6} fill="transparent" />
          </g>
        })}</g>
        <g data-liangxiang-market-direction-legend="" role="img" aria-label="量带：夯／拉" transform={`translate(${size.width - RIGHT / 2},${volumeY + volumeHeight / 2})`} pointerEvents="none" fill={LIGHT_INK} fontSize="11">
          <circle cx="-23" r="2.5" fill={VERMILION} /><text x="-16" y="4">夯</text><circle cx="8" r="2.5" fill={SLATE} /><text x="15" y="4">拉</text>
        </g>
        {ticks.filter((_tick, index) => size.width >= 500 || index === 0 || index === ticks.length - 1 || index % 2 === 0).map((tick, index, shown) => <g key={tick.at} className={marketClass('time-tick')}><text x={x(tick.at)} y={size.height - 5} textAnchor={index === 0 ? 'start' : index === shown.length - 1 ? 'end' : 'middle'} fill={LIGHT_INK} fontSize="11">{tick.label}</text></g>)}
      </svg>
      {tip && <div className={marketClass('chart-tip')} data-liangxiang-market-point-detail="" role="tooltip" aria-label={readout} style={marketTooltipPosition(tip)}>
        {special || !selected ? readout : <><b>{selectedTime}</b><span>本段上香{formatMarketIncense(selected.volume)}炷</span><span>夯{formatMarketIncense(selected.confirmed_up)} · 拉{formatMarketIncense(selected.confirmed_down)}</span>{selected.unknown_volume > 0 && <span>方向明细缺失{formatMarketIncense(selected.unknown_volume)}炷</span>}</>}
      </div>}
    </div>
    <span className={marketClass('a11y')} aria-live={tip?.keyboard ? 'polite' : 'off'}>{readout}</span>
  </figure>
})
