/**
 * 走势 (K 线) client surface.
 *
 * The picture itself is rendered by the Host (`/liangxiang/api/bars.svg`) so the
 * same bytes can be embedded elsewhere; this file only adds what an embed
 * cannot: interval switching, a keyboard-readable readout, and the display
 * states (dock / float / full / closed-and-remembered).
 *
 * The chart is read-only. A dashed band means this machine was not running —
 * it never means nobody voted.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { BARS_INTERVALS, type BarsInterval, type BarsPayload } from '../shared/bars-v1.ts'
// Import the pure geometry directly: the barrel also re-exports the server-only
// SVG renderer, which must never ride along into the client bundle.
import { layoutBars } from '../domain/bars.ts'
import { color, font } from './theme.ts'

export type BarsDisplay = 'dock' | 'float' | 'full'
export type BarsSlot = BarsDisplay | 'closed'

const PREF_KEY = 'liangxiang:bars:v1'
const SHORT: Record<BarsInterval, string> = { '5m': '5分', '15m': '15分', '1h': '1时', '1d': '1日' }
const SIZE: Record<BarsDisplay, { width: number, height: number }> = {
  dock: { width: 272, height: 116 },
  float: { width: 820, height: 300 },
  full: { width: 1180, height: 560 },
}

export interface BarsPrefs {
  slot: BarsSlot
  interval: BarsInterval
}

const DEFAULT_PREFS: BarsPrefs = { slot: 'closed', interval: '5m' }

/** Cosmetic preference only: which view was last chosen by this browser. */
export function readBarsPrefs(): BarsPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(PREF_KEY)
    if (typeof raw !== 'string') return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<BarsPrefs>
    const slot = parsed.slot ?? DEFAULT_PREFS.slot
    return {
      slot: slot === 'dock' || slot === 'float' || slot === 'full' ? slot : DEFAULT_PREFS.slot,
      interval: (BARS_INTERVALS as readonly string[]).includes(String(parsed.interval))
        ? parsed.interval as BarsInterval
        : DEFAULT_PREFS.interval,
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

interface SurfaceProps {
  interval: BarsInterval
  onInterval: (interval: BarsInterval) => void
  onDisplay: (slot: BarsSlot) => void
}

interface ChartProps {
  variant: BarsDisplay
  interval: BarsInterval
}

/** Server-rendered picture plus our own keyboard crosshair and readout. */
function Chart({ variant, interval }: ChartProps): ReactElement {
  const { width, height } = SIZE[variant]
  const dark = useDark()
  const [payload, setPayload] = useState<BarsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`/liangxiang/api/bars?interval=${interval}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`走势暂不可用（${response.status}）`)
        const body = await response.json() as BarsPayload
        if (live) {
          setPayload(body)
          setError(null)
        }
      } catch (cause) {
        if (live && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : '走势暂不可用')
      }
    }
    void load()
    const timer = setInterval(() => void load(), 20_000)
    return () => {
      live = false
      controller.abort()
      clearInterval(timer)
    }
  }, [interval])

  const columns = payload === null
    ? []
    : layoutBars(payload.days.flatMap(day => day.buckets), {
      width,
      height,
      intervalMs: payload.days[0]?.intervalMs ?? 300_000,
    }).columns
  const at = index === null ? undefined : columns[index]
  const timezone = payload?.timezone ?? 'UTC'

  const describe = (candle: (typeof columns)[number]['candle']): string => {
    const time = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      month: '2-digit',
      day: '2-digit',
      ...(interval === '1d' ? {} : { hour: '2-digit', minute: '2-digit', hour12: false }),
    }).format(new Date(candle.t))
    if (candle.gap) return `${time} 未统计`
    return `${time} 梁位 ${candle.close === null ? '待开梁' : percent(candle.close)} · 夯 ${candle.upVotes} 拉 ${candle.downVotes}`
  }

  const readout = at === undefined
    ? columns.length === 0 ? '今天还没有观察记录，等 DSH 运行一段时间再来。' : '本机观察，非全站账本。方向键逐支查看。'
    : describe(at.candle)

  return (
    <>
      <div
        data-liangxiang-bars-chart=""
        tabIndex={0}
        role="img"
        aria-label={`梁位走势（${SHORT[interval]}），本机观察。${readout}`}
        onMouseLeave={() => setIndex(null)}
        onMouseMove={event => {
          if (columns.length === 0) return
          const box = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - box.left) / box.width) * width
          const hit = columns.findIndex(column => x >= column.x && x < column.x + column.width)
          setIndex(hit < 0 ? null : hit)
        }}
        onKeyDown={event => {
          if (columns.length === 0) return
          if (event.key === 'Escape') setIndex(null)
          else if (event.key === 'ArrowLeft') setIndex(Math.max(0, (index ?? columns.length) - 1))
          else if (event.key === 'ArrowRight') setIndex(Math.min(columns.length - 1, (index ?? -1) + 1))
          else return
          event.preventDefault()
        }}
        style={{ position: 'relative', height: `${height}px`, outline: 'none' }}
      >
        <img
          data-liangxiang-bars-image=""
          src={`/liangxiang/api/bars.svg?interval=${interval}&theme=${dark ? 'dark' : 'light'}&w=${width}&h=${height}`}
          alt={`梁位走势图（${SHORT[interval]}）`}
          width={width}
          height={height}
          style={{ width: '100%', height: '100%', display: 'block', borderRadius: '8px' }}
        />
        {at === undefined ? null : (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${((at.x + at.width / 2) / width) * 100}%`,
              top: 0,
              bottom: 0,
              width: '1px',
              background: color.ritualEmber,
              opacity: 0.55,
            }}
          />
        )}
      </div>
      <p
        data-liangxiang-bars-readout=""
        aria-live="polite"
        style={{ margin: '3px 0 0', minHeight: '14px', fontSize: '9px', lineHeight: 1.5, color: error ? color.danger : color.textSecondary }}
      >
        {error ?? readout}
      </p>
    </>
  )
}

function IntervalTabs({ interval, onChange }: { interval: BarsInterval, onChange: (value: BarsInterval) => void }): ReactElement {
  return (
    <span role="group" aria-label="烛长" style={{ display: 'inline-flex', gap: '3px' }}>
      {BARS_INTERVALS.map(option => (
        <button
          key={option}
          type="button"
          data-liangxiang-bars-interval={option}
          aria-pressed={option === interval}
          onClick={() => onChange(option)}
          style={{
            ...BUTTON,
            border: `1px solid ${option === interval ? color.ritualEmber : color.border}`,
            color: option === interval ? color.textPrimary : color.textSecondary,
          }}
        >
          {SHORT[option]}
        </button>
      ))}
    </span>
  )
}

export interface BarsWindowProps extends SurfaceProps {
  display: 'float' | 'full'
  onClose: () => void
}

/** Floating / full-screen presentation. */
export function BarsWindow({ display, interval, onInterval, onDisplay, onClose }: BarsWindowProps): ReactElement {
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
          width: `${SIZE[display].width}px`,
          maxWidth: 'calc(100vw - 24px)',
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
          <IntervalTabs interval={interval} onChange={onInterval} />
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
        <Chart variant={display} interval={interval} />
        <p style={{ margin: '2px 0 0', fontSize: '9px', color: color.textTertiary, lineHeight: 1.5 }}>
          虚线区间表示本机 DSH 未运行、没有采到样本，不代表那段时间无人投票；期间的票仍计入累计。
        </p>
      </div>
    </div>
  )
}

export interface BarsDockProps extends SurfaceProps {
  onDisplay: (slot: BarsSlot) => void
}

/** Compact card in the lower-right corner, remembered until closed. */
export function BarsDock({ interval, onInterval, onDisplay }: BarsDockProps): ReactElement {
  return (
    <div
      data-liangxiang-bars-dock=""
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '88px',
        zIndex: 2_147_482_900,
        width: `${SIZE.dock.width + 18}px`,
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
        <IntervalTabs interval={interval} onChange={onInterval} />
        <button type="button" data-liangxiang-bars-action="float" onClick={() => onDisplay('float')} style={BUTTON}>展开</button>
        <button type="button" data-liangxiang-bars-action="close" onClick={() => onDisplay('closed')} aria-label="收起走势" style={BUTTON}>×</button>
      </div>
      <Chart variant="dock" interval={interval} />
    </div>
  )
}
