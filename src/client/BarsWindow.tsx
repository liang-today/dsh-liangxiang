/**
 * 走势 (K 线) client surface.
 *
 * The picture itself is rendered by the Host (`/liangxiang/api/bars.svg`) so the
 * same bytes can be embedded elsewhere; this file adds only what an embed
 * cannot: wheel zoom, drag pan, a hover readout, range presets, and the four
 * display states (compact corner card / floating / full / closed-and-remembered).
 *
 * The chart is read-only. A hatched band means this machine was not sampling —
 * it never means nobody voted.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement, type RefObject } from 'react'
import { BARS_INTERVAL_MS, type BarsInterval, type BarsPayload } from '../shared/bars-v1.ts'
// Import the pure geometry directly: the barrel also re-exports the server-only
// SVG renderer, which must never ride along into the client bundle.
import { layoutBars } from '../domain/bars.ts'
import { color, font } from './theme.ts'

export type BarsDisplay = 'dock' | 'float' | 'full'
export type BarsSlot = BarsDisplay | 'closed'
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
const SIZE: Record<BarsDisplay, { height: number, fallbackWidth: number }> = {
  dock: { height: 124, fallbackWidth: 272 },
  float: { height: 300, fallbackWidth: 820 },
  full: { height: 520, fallbackWidth: 1180 },
}

export interface BarsPrefs {
  slot: BarsSlot
  range: BarsRange
}

const DEFAULT_PREFS: BarsPrefs = { slot: 'closed', range: '1h' }

/** Cosmetic preference only: which view was last chosen by this browser. */
export function readBarsPrefs(): BarsPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(PREF_KEY)
    if (typeof raw !== 'string') return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<BarsPrefs>
    const slot = parsed.slot ?? DEFAULT_PREFS.slot
    const range = parsed.range ?? DEFAULT_PREFS.range
    return {
      slot: slot === 'dock' || slot === 'float' || slot === 'full' ? slot : DEFAULT_PREFS.slot,
      range: RANGES.some(item => item.key === range) ? range : DEFAULT_PREFS.range,
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
  padding: '1px 7px',
  fontSize: '10px',
  fontFamily: font.family,
  cursor: 'pointer',
} as const

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

function todayStart(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
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

function useWidth(fallback: number): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const node = ref.current
    if (node === null) return
    const measure = (): void => setWidth(Math.max(200, Math.round(node.clientWidth)))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

interface ChartProps {
  variant: BarsDisplay
  range: BarsRange
  onRange: (range: BarsRange) => void
}

/** The interactive surface: server picture + local zoom/pan/readout. */
function Chart({ variant, range, onRange }: ChartProps): ReactElement {
  const height = SIZE[variant].height
  const [wrapRef, width] = useWidth(SIZE[variant].fallbackWidth)
  const [view, setView] = useState<{ from: number, to: number } | null>(null)
  const [payload, setPayload] = useState<BarsPayload | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ x: number, from: number, to: number } | null>(null)
  const dark = useDark()
  const now = Date.now()

  const spanOf = useCallback((current: { from: number, to: number } | null): { from: number, to: number } => {
    if (current !== null) return current
    const preset = RANGES.find(item => item.key === range)
    if (preset?.spanMs !== null && preset?.spanMs !== undefined) {
      return { from: now - preset.spanMs, to: now }
    }
    if (range === 'today') return { from: todayStart(now), to: now }
    // 全部: ask the server for everything it has.
    return { from: 0, to: now }
  }, [range, now])

  const window = spanOf(view)
  const interval = intervalFor(Math.max(MIN_SPAN_MS, window.to - window.from))
  const query = new URLSearchParams({ interval })
  if (view !== null) {
    query.set('from', String(window.from))
    query.set('to', String(window.to))
  } else if (range !== 'all') {
    query.set('from', String(window.from))
    query.set('to', String(window.to))
  }

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`/liangxiang/api/bars?${query.toString()}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`走势暂不可用（${response.status}）`)
        const body = await response.json() as BarsPayload
        if (live) {
          setPayload(body)
          setFailed(null)
        }
      } catch (cause) {
        if (live && !controller.signal.aborted) setFailed(cause instanceof Error ? cause.message : '走势暂不可用')
      }
    }
    // A wheel storm must not turn into one request per event.
    const timer = setTimeout(() => void load(), 90)
    const poll = setInterval(() => void load(), 20_000)
    return () => {
      live = false
      controller.abort()
      clearTimeout(timer)
      clearInterval(poll)
    }
  }, [query.toString()])

  const candles = payload === null ? [] : payload.days.flatMap(day => day.buckets)
  const geometry = candles.length === 0
    ? null
    : layoutBars(candles, { width, height, intervalMs: payload?.days[0]?.intervalMs ?? BARS_INTERVAL_MS[interval] })
  const columns = geometry?.columns ?? []
  const current = hover === null ? undefined : columns[hover]
  const lastClose = [...columns].reverse().find(column => column.candle.close !== null && !column.candle.gap)?.candle.close ?? null
  const timezone = payload?.timezone ?? 'UTC'
  const src = `/liangxiang/api/bars.svg?${new URLSearchParams({ ...Object.fromEntries(query), theme: dark ? 'dark' : 'light', w: String(width), h: String(height) }).toString()}`

  const clock = (t: number): string => new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
    ...(interval === '1d' ? {} : { hour: '2-digit', minute: '2-digit', hour12: false }),
  }).format(new Date(t))

  const describe = (index: number): string => {
    const candle = columns[index]?.candle
    if (candle === undefined) return ''
    if (candle.gap) return `${clock(candle.t)} 未统计`
    const r = (value: number | null): string => value === null ? '待开梁' : percent(value)
    return `${clock(candle.t)}  开${r(candle.open)} 高${r(candle.high)} 低${r(candle.low)} 收${r(candle.close)} · 夯${candle.upVotes} 拉${candle.downVotes}`
  }

  const pickIndex = (clientX: number, element: HTMLElement): number => {
    if (columns.length === 0) return -1
    const box = element.getBoundingClientRect()
    const x = ((clientX - box.left) / box.width) * width
    return columns.findIndex(column => x >= column.x && x < column.x + column.width)
  }

  const zoom = (factor: number, anchor: number | null): void => {
    const span = window.to - window.from
    const nextSpan = Math.min(Math.max(span * factor, MIN_SPAN_MS), 400 * 86_400_000)
    const ratio = anchor === null ? 1 : anchor
    const end = window.to
    const anchorTime = window.from + span * ratio
    const from = anchorTime - nextSpan * ratio
    const to = from + nextSpan
    const capped = Math.min(to, Date.now())
    setView({ from: Math.max(0, capped - nextSpan), to: capped })
    void end
  }

  const readout = current === undefined
    ? failed !== null
      ? failed
      : columns.length === 0
        ? '这个时间段还没有观察记录，换个范围或等 DSH 运行一会儿。'
        : `本机观察，非全站账本。最新 ${lastClose === null ? '待开梁' : percent(lastClose)} · 滚轮缩放 · 拖动平移`
    : describe(columns.indexOf(current))

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
          drag.current = { x: event.clientX, from: window.from, to: window.to }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={event => {
          if (drag.current !== null) {
            const box = event.currentTarget.getBoundingClientRect()
            if (Math.abs(event.clientX - drag.current.x) < 3) setHover(pickIndex(event.clientX, event.currentTarget) < 0 ? null : pickIndex(event.clientX, event.currentTarget))
            void box
          }
          drag.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const active = drag.current
          if (active !== null) {
            const box = event.currentTarget.getBoundingClientRect()
            const span = active.to - active.from
            const shift = ((event.clientX - active.x) / Math.max(1, box.width)) * span
            const to = Math.min(Date.now(), Math.max(span, active.to - shift))
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
          zoom(event.deltaY > 0 ? 1.25 : 0.8, null)
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') setHover(null)
          else if (event.key === 'ArrowLeft') setHover(Math.max(0, (hover ?? columns.length) - 1))
          else if (event.key === 'ArrowRight') setHover(Math.min(columns.length - 1, (hover ?? -1) + 1))
          else if (event.key === '+' || event.key === '=') zoom(0.8, null)
          else if (event.key === '-') zoom(1.25, null)
          else if (event.key === '0') setView(null)
          else return
          event.preventDefault()
        }}
        style={{ position: 'relative', height: `${height}px`, outline: 'none', cursor: drag.current === null ? 'crosshair' : 'grabbing', touchAction: 'none' }}
      >
        <img
          data-liangxiang-bars-image=""
          src={src}
          alt={`梁位走势图（${RANGES.find(item => item.key === range)?.label ?? ''}）`}
          width={width}
          height={height}
          draggable={false}
          style={{ width: '100%', height: '100%', display: 'block', borderRadius: '10px' }}
        />
        {current === undefined ? null : (
          <>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${((current.x + current.width / 2) / width) * 100}%`,
                top: 0,
                bottom: 0,
                width: '1px',
                background: color.ritualEmber,
                opacity: 0.5,
              }}
            />
            <span
              role="tooltip"
              style={{
                position: 'absolute',
                left: `${Math.min(76, Math.max(2, ((current.x + current.width / 2) / width) * 100))}%`,
                top: '2px',
                padding: '3px 6px',
                borderRadius: '5px',
                background: color.bgLayer,
                border: `1px solid ${color.border}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                fontSize: '9px',
                lineHeight: 1.45,
                color: color.textPrimary,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {describe(columns.indexOf(current))}
            </span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
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
          <button type="button" data-liangxiang-bars-action="latest" onClick={() => setView(null)} style={BUTTON}>
            回到最新
          </button>
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

export interface BarsWindowProps {
  display: 'float' | 'full'
  range: BarsRange
  onRange: (range: BarsRange) => void
  onDisplay: (slot: BarsSlot) => void
  onClose: () => void
}

/** Floating / full-screen presentation. */
export function BarsWindow({ display, range, onRange, onDisplay, onClose }: BarsWindowProps): ReactElement {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      globalThis.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      data-liangxiang-bars-backdrop=""
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2_147_483_000,
        background: 'rgba(0,0,0,0.34)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="梁位走势"
        data-liangxiang-bars-window={display}
        style={{
          width: display === 'full' ? 'min(1180px, calc(100vw - 24px))' : 'min(820px, calc(100vw - 24px))',
          borderRadius: '14px',
          border: `1px solid ${color.border}`,
          background: color.bgLayer,
          boxShadow: '0 22px 54px rgba(0,0,0,0.3)',
          padding: '10px 12px 8px',
          fontFamily: font.family,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <strong style={{ fontSize: '12px', letterSpacing: '1px' }}>梁位走势</strong>
          <span style={{ fontSize: '9px', color: color.textTertiary }}>本机观察 · 只读</span>
          <span style={{ flex: 1 }} />
          <button type="button" data-liangxiang-bars-action="dock" onClick={() => onDisplay('dock')} style={BUTTON}>紧凑</button>
          <button
            type="button"
            data-liangxiang-bars-action={display === 'full' ? 'float' : 'full'}
            onClick={() => onDisplay(display === 'full' ? 'float' : 'full')}
            style={BUTTON}
          >
            {display === 'full' ? '缩小' : '全屏'}
          </button>
          <button type="button" data-liangxiang-bars-action="close" onClick={onClose} aria-label="关闭走势" style={BUTTON}>×</button>
        </div>
        <Chart variant={display} range={range} onRange={onRange} />
        <p style={{ margin: '4px 0 0', fontSize: '9px', color: color.textTertiary, lineHeight: 1.5 }}>
          虚线区间表示本机 DSH 未运行、没有采到样本，不代表那段时间无人投票；期间的票仍计入累计。
        </p>
      </div>
    </div>
  )
}

export interface BarsDockProps {
  range: BarsRange
  onRange: (range: BarsRange) => void
  onDisplay: (slot: BarsSlot) => void
}

/** Compact card in the lower-right corner, remembered until closed. */
export function BarsDock({ range, onRange, onDisplay }: BarsDockProps): ReactElement {
  return (
    <div
      data-liangxiang-bars-dock=""
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '88px',
        zIndex: 2_147_482_900,
        width: '304px',
        borderRadius: '10px',
        border: `1px solid ${color.border}`,
        background: color.bgLayer,
        boxShadow: '0 8px 22px rgba(0,0,0,0.16)',
        padding: '6px 8px 4px',
        fontFamily: font.family,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
        <strong style={{ fontSize: '10px', letterSpacing: '1px' }}>走势</strong>
        <span style={{ flex: 1 }} />
        <button type="button" data-liangxiang-bars-action="float" onClick={() => onDisplay('float')} style={BUTTON}>展开</button>
        <button type="button" data-liangxiang-bars-action="close" onClick={() => onDisplay('closed')} aria-label="收起走势" style={BUTTON}>×</button>
      </div>
      <Chart variant="dock" range={range} onRange={onRange} />
    </div>
  )
}
