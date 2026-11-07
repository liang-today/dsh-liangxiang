/**
 * 走势 (K 线) client surfaces.
 *
 * The picture itself is rendered by the Host (`/liangxiang/api/bars.svg`) so the
 * same bytes can be embedded elsewhere; this file adds only what an embed
 * cannot: wheel zoom, drag pan, a hover readout, range presets, and the four
 * display states — attached under 今日梁案, floating, full screen, or closed
 * until the 梁相案牍 row opens it again.
 *
 * The chart is read-only. A hatched band means this machine was not sampling —
 * it never means nobody voted.
 */
import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react'
import { BARS_INTERVAL_MS, type BarsCandle, type BarsInterval, type BarsMeta, type BarsPayload } from '../shared/bars-v1.ts'
import { businessDateStartsAt, createBusinessDateProvider } from '../shared/business-date.ts'
// Import the pure geometry directly: the barrel also re-exports the server-only
// SVG renderer, which must never ride along into the client bundle.
import { layoutBars } from '../domain/bars.ts'
import { color, font } from './theme.ts'

/** Attached under 今日梁案, floating, full screen, or closed and remembered. */
export type BarsSlot = 'attach' | 'float' | 'full' | 'closed'
/** 15 分钟 / 1 小时 / 今日 / 全部. */
export type BarsRange = '15m' | '1h' | 'today' | 'all'

const PREF_KEY = 'liangxiang:bars:v1'
const MIN_SPAN_MS = 5 * 60_000
const RANGES: { key: BarsRange, label: string, spanMs: number | null }[] = [
  { key: '15m', label: '15分', spanMs: 15 * 60_000 },
  { key: '1h', label: '1时', spanMs: 60 * 60_000 },
  { key: 'today', label: '今日', spanMs: null },
  { key: 'all', label: '全部', spanMs: null },
]

export interface BarsPrefs {
  slot: BarsSlot
  range: BarsRange
  /** Floating window position, in CSS pixels. Null = centred. */
  x: number | null
  y: number | null
}

const DEFAULT_PREFS: BarsPrefs = { slot: 'closed', range: '1h', x: null, y: null }
const SLOTS: BarsSlot[] = ['attach', 'float', 'full', 'closed']

/** Cosmetic preference only: which surface was last chosen by this browser. */
export function readBarsPrefs(): BarsPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(PREF_KEY)
    if (typeof raw !== 'string') return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<BarsPrefs>
    const slot = parsed.slot ?? DEFAULT_PREFS.slot
    const range = parsed.range ?? DEFAULT_PREFS.range
    return {
      slot: SLOTS.includes(slot) ? slot : DEFAULT_PREFS.slot,
      range: RANGES.some(item => item.key === range) ? range : DEFAULT_PREFS.range,
      x: typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : null,
      y: typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writeBarsPrefs(patch: Partial<BarsPrefs>): BarsPrefs {
  const next = { ...readBarsPrefs(), ...patch }
  try {
    globalThis.localStorage?.setItem(PREF_KEY, JSON.stringify(next))
  } catch {
    // A full quota must not break the panel.
  }
  return next
}

const BUTTON = {
  border: `1px solid ${color.border}`,
  background: color.bgSubtle,
  color: color.textSecondary,
  borderRadius: '6px',
  padding: '2px 8px',
  fontSize: '10px',
  fontFamily: font.family,
  cursor: 'pointer',
  lineHeight: 1.4,
} as const

const NOTE = { margin: '3px 0 0', fontSize: '9px', lineHeight: 1.5, color: color.textTertiary } as const

/** Truncated, never rounded: a label must not claim a crossing 梁位 has not made. */
function percent(value: number): string {
  return `${(Math.trunc(value * 10_000) / 100).toFixed(2)}%`
}

/** Candle size follows the visible span, the way a stock chart coarsens periods. */
function intervalFor(spanMs: number): BarsInterval {
  if (spanMs <= 30 * 60_000) return '1m'
  if (spanMs <= 3 * 3_600_000) return '5m'
  if (spanMs <= 12 * 3_600_000) return '15m'
  if (spanMs <= 3 * 86_400_000) return '1h'
  return '1d'
}

/**
 * The window the chart asks for, in whole epoch milliseconds.
 *
 * Drag and zoom maths produce fractions; the wire contract only accepts
 * integers, so rounding happens here — one place, not at every call site.
 * `null` means "everything this Host has".
 */
export function barsWindow(range: BarsRange, view: { from: number, to: number } | null, now: number, timezone = 'UTC', days: readonly string[] = []): { from: number, to: number } | null {
  const clamp = (value: number, fallback: number): number => (Number.isFinite(value) ? Math.round(value) : fallback)
  if (view !== null) {
    const from = clamp(view.from, 0)
    const to = clamp(view.to, now)
    return { from: Math.max(0, Math.min(from, to)), to: Math.max(0, to) }
  }
  const preset = RANGES.find(item => item.key === range)
  if (preset?.spanMs !== null && preset?.spanMs !== undefined) {
    const to = Math.round(now)
    return { from: Math.max(0, to - preset.spanMs), to }
  }
  const dates = createBusinessDateProvider(timezone)
  if (range === 'today') return { from: businessDateStartsAt(dates, dates.businessDateOf(now)), to: Math.round(now) }
  if (range === 'all') {
    for (const date of days) {
      try {
        return { from: businessDateStartsAt(dates, date), to: Math.round(now) }
      } catch {
        // A corrupt derived day filename must not take down the main panel.
      }
    }
  }
  return null
}

/** A zero-vote case and an unobserved interval must never invent a ratio. */
export function barsSummary(candles: readonly BarsCandle[]): string {
  const last = candles.at(-1)
  if (last === undefined) return '这个时间段还没有观察记录。'
  if (last.gap) return '未统计'
  const ratio = last.close === null ? '待开梁' : percent(last.close)
  return `${ratio} · 夯 ${last.upVotes} 拉 ${last.downVotes}`
}

function useDark(): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    if (query === undefined) return
    const sync = (): void => setDark(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return dark
}

function useWidth(fallback: number, height: number): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const node = ref.current
    if (node === null) return
    const measure = (): void => setWidth(Math.min(1600, Math.max(320, Math.round(node.clientWidth))))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [height])
  return [ref, width]
}

export interface BarsChartProps {
  variant: BarsSlot
  range: BarsRange
  onRange: (range: BarsRange) => void
}

/** The interactive chart: server picture plus local zoom, pan and readout. */
export function BarsChart({ variant, range, onRange }: BarsChartProps): ReactElement {
  const floating = variant === 'float' || variant === 'full'
  const height = variant === 'attach' ? 168 : variant === 'full' ? 460 : 300
  const [wrapRef, width] = useWidth(floating ? 780 : 330, height)
  const [view, setView] = useState<{ from: number, to: number } | null>(null)
  const [payload, setPayload] = useState<BarsPayload | null>(null)
  const [meta, setMeta] = useState<BarsMeta | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ x: number, from: number, to: number } | null>(null)
  const dark = useDark()
  // A clock we own: it advances once per refresh period, so hover and drag
  // renders cannot change the requested window (which used to re-fetch on
  // every pointer move).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(timer)
  }, [])

  const timezone = meta?.timezone ?? 'UTC'
  const window = barsWindow(range, view, now, timezone, meta?.days)
  const visible = window ?? { from: now - 3_600_000, to: now }
  const interval = intervalFor(Math.max(MIN_SPAN_MS, visible.to - visible.from))
  const query = new URLSearchParams({ interval })
  if (window !== null) {
    query.set('from', String(window.from))
    query.set('to', String(window.to))
  }
  const queryKey = query.toString()
  const needsMeta = meta === null

  useEffect(() => {
    if (!needsMeta) return
    const controller = new AbortController()
    void fetch('/liangxiang/api/bars/meta', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('走势数据暂时读不到，稍后自会重试。')
        return await response.json() as BarsMeta
      })
      .then(value => { if (!controller.signal.aborted) setMeta(value) })
      .catch(() => { if (!controller.signal.aborted) setFailed('走势数据暂时读不到，稍后自会重试。') })
    return () => controller.abort()
  }, [needsMeta, now])

  useEffect(() => {
    if (needsMeta) return
    let live = true
    const controller = new AbortController()
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`/liangxiang/api/bars?${queryKey}`, { signal: controller.signal })
        if (!response.ok) {
          // Never show a raw wire error to a player: it reads as a crash.
          throw new Error(response.status >= 500 ? '走势数据暂时读不到，稍后自会重试。' : '这个时间段暂时没有可用的走势。')
        }
        const body = await response.json() as BarsPayload
        if (!live) return
        setPayload(body)
        setMeta(body.meta)
        setFailed(null)
      } catch (cause) {
        if (live && !controller.signal.aborted) setFailed(cause instanceof Error ? cause.message : '走势暂不可用')
      }
    }
    // One debounce per window change; the clock above schedules the refresh,
    // so there is no second timer racing it.
    const timer = setTimeout(() => void load(), 90)
    return () => {
      live = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [queryKey, needsMeta])

  const candles = payload === null ? [] : payload.days.flatMap(day => day.buckets)
  const geometry = candles.length === 0
    ? null
    : layoutBars(candles, { width, height, intervalMs: payload?.days[0]?.intervalMs ?? BARS_INTERVAL_MS[interval] })
  const columns = geometry?.columns ?? []
  const current = hover === null ? undefined : columns[hover]
  const src = `/liangxiang/api/bars.svg?${new URLSearchParams({ ...Object.fromEntries(query), theme: dark ? 'dark' : 'light', w: String(width), h: String(height) }).toString()}`

  const clock = (t: number): string => new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    ...(interval === '1d' ? {} : { hour: '2-digit', minute: '2-digit', hour12: false }),
    ...(interval === '1d' ? { month: '2-digit', day: '2-digit' } : {}),
  }).format(new Date(t))

  const describe = (column: typeof columns[number]): string => {
    const candle = column.candle
    if (candle.gap) return `${clock(candle.t)} 未统计`
    const r = (value: number | null): string => value === null ? '待开梁' : percent(value)
    return `${clock(candle.t)}  开 ${r(candle.open)}  高 ${r(candle.high)}  低 ${r(candle.low)}  收 ${r(candle.close)}`
  }

  const pickIndex = (clientX: number, element: HTMLElement): number => {
    if (columns.length === 0) return -1
    const box = element.getBoundingClientRect()
    const x = ((clientX - box.left) / box.width) * width
    return columns.findIndex(column => x >= column.x && x < column.x + column.width)
  }

  const zoom = (factor: number): void => {
    const span = Math.max(MIN_SPAN_MS, visible.to - visible.from)
    const nextSpan = Math.round(Math.min(Math.max(span * factor, MIN_SPAN_MS), 400 * 86_400_000))
    const to = Math.round(Math.min(Date.now(), visible.to))
    setView({ from: Math.max(0, to - nextSpan), to })
  }

  const readout = current !== undefined
    ? describe(current)
    : failed !== null
      ? failed
      : needsMeta ? '正在读取走势…' : barsSummary(candles)

  return (
    <>
      <div
        ref={wrapRef}
        data-liangxiang-bars-chart=""
        tabIndex={0}
        role="img"
        aria-label={`梁位走势，${RANGES.find(item => item.key === range)?.label ?? ''}。${readout}`}
        onPointerLeave={() => {
          setHover(null)
          drag.current = null
        }}
        onPointerDown={event => {
          drag.current = { x: event.clientX, from: visible.from, to: visible.to }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={event => {
          const active = drag.current
          drag.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
          if (active === null) return
          if (Math.abs(event.clientX - active.x) < 3) {
            const found = pickIndex(event.clientX, event.currentTarget)
            setHover(found < 0 ? null : found)
          }
        }}
        onPointerMove={event => {
          const active = drag.current
          if (active !== null) {
            const box = event.currentTarget.getBoundingClientRect()
            const span = active.to - active.from
            const shift = ((event.clientX - active.x) / Math.max(1, box.width)) * span
            const to = Math.round(Math.min(Date.now(), Math.max(span, active.to - shift)))
            setView({ from: to - span, to })
            setHover(null)
            return
          }
          const found = pickIndex(event.clientX, event.currentTarget)
          setHover(found < 0 ? null : found)
        }}
        onDoubleClick={() => {
          setView(null)
          setHover(null)
        }}
        onWheel={event => {
          event.preventDefault()
          zoom(event.deltaY > 0 ? 1.25 : 0.8)
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') setHover(null)
          else if (event.key === 'ArrowLeft') setHover(Math.max(0, (hover ?? columns.length) - 1))
          else if (event.key === 'ArrowRight') setHover(Math.min(columns.length - 1, (hover ?? -1) + 1))
          else if (event.key === '+' || event.key === '=') zoom(0.8)
          else if (event.key === '-') zoom(1.25)
          else if (event.key === '0') setView(null)
          else return
          event.preventDefault()
        }}
        style={{ position: 'relative', height: `${height}px`, outline: 'none', cursor: 'crosshair', touchAction: 'none' }}
      >
        <img
          data-liangxiang-bars-image=""
          src={needsMeta ? undefined : src}
          alt={`梁位走势图（${RANGES.find(item => item.key === range)?.label ?? ''}）`}
          width={width}
          height={height}
          draggable={false}
          onError={() => setFailed('走势图暂时画不出来，稍后自会重试。')}
          style={{ width: '100%', height: '100%', display: 'block', borderRadius: '10px', border: `1px solid ${color.border}` }}
        />
        {current === undefined ? null : (
          <>
            <span aria-hidden="true" style={{ position: 'absolute', left: `${((current.x + current.width / 2) / width) * 100}%`, top: 0, bottom: 0, width: '1px', background: color.ritualEmber, opacity: 0.45 }} />
            <span
              role="tooltip"
              style={{
                position: 'absolute',
                left: `${Math.min(70, Math.max(1, ((current.x + current.width / 2) / width) * 100))}%`,
                top: '3px',
                padding: '3px 7px',
                borderRadius: '6px',
                background: color.bgLayer,
                border: `1px solid ${color.border}`,
                boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                fontSize: '10px',
                lineHeight: 1.45,
                color: color.textPrimary,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {describe(current)}
            </span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px', minWidth: 0 }}>
        {RANGES.map(item => (
          <button
            key={item.key}
            type="button"
            data-liangxiang-bars-range={item.key}
            data-on={item.key === range ? '1' : '0'}
            aria-pressed={item.key === range}
            onClick={() => {
              onRange(item.key)
              setView(null)
              setHover(null)
            }}
            style={{
              ...BUTTON,
              border: `1px solid ${item.key === range ? color.ritualEmber : color.border}`,
              color: item.key === range ? color.textPrimary : color.textSecondary,
            }}
          >
            {item.label}
          </button>
        ))}
        {view === null ? null : (
          <button type="button" data-liangxiang-bars-action="latest" onClick={() => setView(null)} style={BUTTON}>最新</button>
        )}
        <span style={{ flex: 1 }} />
        <span
          data-liangxiang-bars-readout=""
          aria-live="polite"
          style={{ fontSize: '9px', color: failed === null ? color.textSecondary : color.danger, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
        >
          {readout}
        </span>
      </div>
    </>
  )
}

export interface BarsAttachedProps {
  range: BarsRange
  onRange: (range: BarsRange) => void
  onSlot: (slot: BarsSlot) => void
}

/** The compact surface that rides directly under 今日梁案 inside the panel. */
export function BarsAttached({ range, onRange, onSlot }: BarsAttachedProps): ReactElement {
  return (
    <section
      data-liangxiang-bars-attached=""
      aria-label="梁位走势"
      style={{ marginTop: '9px', paddingTop: '8px', borderTop: `1px solid ${color.border}` }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <strong style={{ fontSize: '10px', letterSpacing: '1px' }}>梁位走势</strong>
        <span style={{ fontSize: '9px', color: color.textTertiary }}>本机观察 · 只读</span>
        <span style={{ flex: 1 }} />
        <button type="button" data-liangxiang-bars-action="float" onClick={() => onSlot('float')} style={BUTTON}>浮窗</button>
        <button type="button" data-liangxiang-bars-action="full" onClick={() => onSlot('full')} style={BUTTON}>全屏</button>
        <button type="button" data-liangxiang-bars-action="close" onClick={() => onSlot('closed')} aria-label="收起走势" style={BUTTON}>×</button>
      </div>
      <BarsChart variant="attach" range={range} onRange={onRange} />
      <p style={NOTE}>斜线区间表示未采到样本，不代表无人投票；期间投票仍计入累计。</p>
    </section>
  )
}

export interface BarsWindowProps {
  display: 'float' | 'full'
  range: BarsRange
  onRange: (range: BarsRange) => void
  onSlot: (slot: BarsSlot) => void
  position: { x: number | null, y: number | null }
  onMove: (position: { x: number, y: number }) => void
  onClose: () => void
}

/** Floating (draggable) and full-screen presentation. */
export function BarsWindow({ display, range, onRange, onSlot, position, onMove, onClose }: BarsWindowProps): ReactElement {
  const [origin, setOrigin] = useState<{ x: number, y: number } | null>(null)
  const drag = useRef<{ x: number, y: number, left: number, top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [onClose])

  const left = origin?.x ?? position.x ?? Math.max(16, Math.round((globalThis.innerWidth ?? 1200) / 2 - 410))
  const top = origin?.y ?? position.y ?? 88

  const frame = display === 'full'
    ? { position: 'fixed' as const, inset: '16px', zIndex: 2_147_483_000 }
    : { position: 'fixed' as const, left: `${left}px`, top: `${top}px`, width: 'min(820px, calc(100vw - 32px))', zIndex: 2_147_483_000 }

  return (
    <>
      {display === 'full' ? (
        <div
          data-liangxiang-bars-backdrop=""
          onMouseDown={event => {
            if (event.target === event.currentTarget) onClose()
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 2_147_482_999, background: 'rgba(0,0,0,0.34)' }}
        />
      ) : null}
      <div role="dialog" aria-modal="true" aria-label="梁位走势" data-liangxiang-bars-window={display} ref={box} style={{
        ...frame,
        borderRadius: '14px',
        border: `1px solid ${color.border}`,
        background: color.bgLayer,
        boxShadow: '0 22px 54px rgba(0,0,0,0.3)',
        padding: '8px 11px 7px',
        fontFamily: font.family,
        color: color.textPrimary,
      }}>
        <div
          data-liangxiang-bars-handle=""
          onPointerDown={event => {
            // Pointer capture on the handle would steal the button's pointerup
            // and the click would never fire.
            if (display === 'full') return
            if ((event.target as HTMLElement).closest('button') !== null) return
            drag.current = { x: event.clientX, y: event.clientY, left, top }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            const active = drag.current
            if (active === null) return
            const x = Math.min(Math.max(0, active.left + event.clientX - active.x), Math.max(0, (globalThis.innerWidth ?? 1200) - 240))
            const y = Math.min(Math.max(0, active.top + event.clientY - active.y), Math.max(0, (globalThis.innerHeight ?? 800) - 160))
            setOrigin({ x, y })
          }}
          onPointerUp={event => {
            const active = drag.current
            drag.current = null
            try {
              event.currentTarget.releasePointerCapture(event.pointerId)
            } catch {
              // The capture may already be gone; nothing to do.
            }
            if (active !== null) onMove({ x: left, y: top })
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: display === 'float' ? 'grab' : 'default', touchAction: 'none', paddingBottom: '5px' }}
        >
          <strong style={{ fontSize: '12px', letterSpacing: '1px' }}>梁位走势</strong>
          <span style={{ fontSize: '9px', color: color.textTertiary }}>本机观察 · 只读</span>
          <span style={{ flex: 1 }} />
          <button type="button" data-liangxiang-bars-action="attach" onClick={() => onSlot('attach')} style={BUTTON}>挂回梁案</button>
          <button type="button" data-liangxiang-bars-action={display === 'full' ? 'float' : 'full'} onClick={() => onSlot(display === 'full' ? 'float' : 'full')} style={BUTTON}>
            {display === 'full' ? '缩小' : '全屏'}
          </button>
          <button type="button" data-liangxiang-bars-action="close" onClick={onClose} aria-label="关闭走势" style={BUTTON}>×</button>
        </div>
        <BarsChart variant={display} range={range} onRange={onRange} />
        <p style={NOTE}>斜线区间表示未采到样本，不代表无人投票；期间投票仍计入累计。</p>
      </div>
    </>
  )
}
