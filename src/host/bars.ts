import { statSync } from 'node:fs'
import { barsDayPath } from './bars-store.ts'
/**
 * 走势 recorder: samples the Host's own view of the world, persists it, serves it.
 *
 * This channel does not replay the separate official market series — it is what this
 * installation *saw*, sampled once a second. That single fact drives everything
 * here: an outage leaves a hole, the hole is recorded as a hole, and the chart
 * says "not observed" instead of pretending the market stood still.
 *
 * The recorder is the only writer of day files. Browsers only read.
 */
import type {
  BarsCandle,
  BarsDay,
  BarsInterval,
  BarsMeta,
  BarsPayload,
  BarsQuery,
} from '../shared/bars-v1.ts'
import {
  BARS_BUCKET_MS,
  BARS_CHANNELS,
  BARS_INTERVAL_MS,
  BARS_INTERVALS,
  BARS_SCHEMA_VERSION,
} from '../shared/bars-v1.ts'
import {
  accrueBarsSample,
  aggregateBars,
  createBarsAccumulator,
  fromBarsDay,
  layoutBars,
  toBarsDay,
} from '../domain/bars.ts'
import type { BarsAccumulator, BarsSample } from '../domain/bars.ts'
import { homedir } from 'node:os'
import { renderBarsSvg } from '../domain/bars-svg.ts'
import type { LiangxiangWireState } from '../shared/wire.ts'
import { businessDayEndsAt, createBusinessDateProvider, type BusinessDateProvider } from '../shared/business-date.ts'
import { listBarsDayDates, readBarsDay, resolveBarsRoot, writeBarsDay } from './bars-store.ts'

export const DEFAULT_BARS_SAMPLE_MS = 1_000
export const DEFAULT_BARS_FLUSH_MS = 30_000
export const BARS_MAX_WINDOW_DAYS = 400

export interface BarsRecorderOptions {
  root: string
  timezone: string
  sampleMs?: number
  flushMs?: number
  now?: () => number
  warn: (message: string) => void
  /** Latest wire state, polled on every tick. */
  readState: () => LiangxiangWireState | null
}

export class BarsRecorder {
  private readonly root: string
  private readonly timezone: string
  private readonly dates: BusinessDateProvider
  private readonly sampleMs: number
  private readonly flushMs: number
  private readonly now: () => number
  private readonly warn: (message: string) => void
  private readonly readState: () => LiangxiangWireState | null
  private accumulator: BarsAccumulator | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private lastFlushAt = 0
  private lastFlushWarningAt = Number.NEGATIVE_INFINITY
  private readonly closedCache = new Map<string, { stamp: string, day: BarsDay }>()
  private readonly pendingWrites = new Map<string, BarsDay>()
  private disposed = false
  private observationUnavailable = false

  constructor(options: BarsRecorderOptions) {
    this.root = options.root
    this.timezone = options.timezone
    this.dates = createBusinessDateProvider(options.timezone)
    this.sampleMs = options.sampleMs ?? DEFAULT_BARS_SAMPLE_MS
    this.flushMs = options.flushMs ?? DEFAULT_BARS_FLUSH_MS
    this.now = options.now ?? Date.now
    this.warn = options.warn
    this.readState = options.readState
  }

  /** Begin the sampling loop. Safe to call twice. */
  start(): void {
    if (this.timer !== null || this.disposed) return
    this.timer = setInterval(() => this.tick(), this.sampleMs)
    this.timer.unref()
  }

  /** One observation cycle: sample, then flush when due. */
  tick(): void {
    if (this.disposed) return
    this.sampleOnce(this.readState())
    if (this.now() - this.lastFlushAt >= this.flushMs) this.flush()
  }

  /**
   * Fold one wire state into today's series. Every tick is recorded, even when
   * the counts are unchanged: a quiet-but-alive Host must not look like an
   * outage.
   * @param state - latest authoritative wire state, or `null` while booting.
   */
  sampleOnce(state: LiangxiangWireState | null): void {
    if (this.disposed) return
    if (state === null || state.authorityAvailable === false) {
      this.observationUnavailable = true
      return
    }
    const businessDate = state.businessDate
    if (typeof businessDate !== 'string' || businessDate.length === 0) return
    const t = this.now()
    if (this.accumulator !== null && this.accumulator.businessDate !== businessDate) {
      // Business-date rollover: seal the old day file, start a clean series.
      this.flush()
      this.accumulator = null
    }
    this.observationUnavailable = false
    const accumulator = this.accumulator ?? this.startDay(businessDate, t)
    const sample: BarsSample = {
      t,
      upVotes: state.global.upVotes,
      downVotes: state.global.downVotes,
      caseId: state.global.caseId ?? state.activeCase?.id ?? '',
      caseTitle: state.activeCase?.title ?? '',
      policyVersion: state.global.liangziPolicyVersion ?? null,
    }
    try {
      accrueBarsSample(accumulator, sample)
    } catch (error) {
      this.warn(`bars sample rejected: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Open today's accumulator. When a day file already exists (restart inside the
   * same business date) its buckets are carried forward and the restart itself
   * is recorded as an outage, so the gap is visible instead of invisible.
   */
  private startDay(businessDate: string, t: number): BarsAccumulator {
    const accumulator = createBarsAccumulator({ businessDate, intervalMs: BARS_BUCKET_MS, sampleMs: this.sampleMs })
    const restored = readBarsDay(this.root, businessDate, this.warn)
    if (restored !== null) {
      const carried = fromBarsDay(restored, this.sampleMs)
      accumulator.buckets = carried.buckets
      accumulator.gaps = carried.gaps
      accumulator.cases = carried.cases
      accumulator.breaks = carried.breaks
      accumulator.policyVersions = carried.policyVersions
      accumulator.firstSampleAt = carried.firstSampleAt
      accumulator.lastSampleAt = carried.lastSampleAt
      accumulator.lastClose = carried.lastClose
      if (carried.lastSampleAt !== 0 && t - carried.lastSampleAt > accumulator.gapThresholdMs) {
        const pending = accumulator.gaps.at(-1)
        if (pending?.from === carried.lastSampleAt) pending.to = t
        else accumulator.gaps.push({ from: carried.lastSampleAt, to: t, reason: 'host-down' })
        // Own the restart instant here so the first sample after it does not
        // record the same silence a second time.
        accumulator.lastSampleAt = t
      }
    }
    this.accumulator = accumulator
    this.lastFlushAt = t
    return accumulator
  }

  /** Persist today's series. Safe to call at any time; idempotent. */
  flush(): void {
    const accumulator = this.accumulator
    if (accumulator !== null) {
      const day = this.currentDay(accumulator)
      if (day.buckets.length > 0) this.pendingWrites.set(day.businessDate, day)
    }
    this.lastFlushAt = this.now()
    for (const [date, day] of this.pendingWrites) {
      try { writeBarsDay(this.root, day); this.pendingWrites.delete(date) } catch {
        if (this.now() - this.lastFlushWarningAt >= 30_000) {
          this.warn('bars persistence unavailable; retaining observed days for retry')
          this.lastFlushWarningAt = this.now()
        }
      }
    }
    // Derived history is bounded independently of all authoritative ledgers.
    while (this.pendingWrites.size > BARS_MAX_WINDOW_DAYS) this.pendingWrites.delete(this.pendingWrites.keys().next().value!)
  }

  /** Show an ongoing outage without advancing the last genuine observation. */
  private currentDay(accumulator: BarsAccumulator): BarsDay {
    const day = toBarsDay(accumulator, null)
    if (!this.observationUnavailable || accumulator.lastSampleAt === 0
      || this.now() - accumulator.lastSampleAt <= accumulator.gapThresholdMs) return day
    // An ongoing outage may span days; keep each derived file inside its own
    // business date rather than manufacturing thousands of future-day buckets.
    const until = Math.min(this.now(), businessDayEndsAt(this.dates, accumulator.lastSampleAt))
    const pending = fromBarsDay(day, this.sampleMs)
    const last = pending.gaps.at(-1)
    if (last?.from === accumulator.lastSampleAt) last.to = until
    else pending.gaps.push({ from: accumulator.lastSampleAt, to: until, reason: 'host-down' })
    return toBarsDay(pending, null)
  }

  /** What this installation can answer for. */
  meta(listed = listBarsDayDates(this.root)): BarsMeta {
    const dates = [...new Set([...listed, ...this.pendingWrites.keys()])]
    const today = this.accumulator
    if (today !== null && today.buckets.length > 0 && !dates.includes(today.businessDate)) {
      dates.push(today.businessDate)
    }
    dates.sort()
    return {
      schemaVersion: BARS_SCHEMA_VERSION,
      channel: BARS_CHANNELS[0],
      timezone: this.timezone,
      bucketMs: BARS_BUCKET_MS,
      intervals: BARS_INTERVALS,
      days: dates,
      newestAt: today === null || today.lastSampleAt === 0 ? null : today.lastSampleAt,
    }
  }

  /**
   * Build the payload for one window. Missing days are simply absent; an
   * unreadable day is skipped with a warning rather than failing the request.
   * @param query - validated query from the route layer.
   */
  read(query: BarsQuery): BarsPayload {
    const interval: BarsInterval = query.interval
    const intervalMs = BARS_INTERVAL_MS[interval]
    const listed = listBarsDayDates(this.root)
    const loaded = this.loadDays(query, listed)
    const days: BarsDay[] = loaded.map(day => {
      const buckets = aggregateBars(day.buckets, BARS_BUCKET_MS, intervalMs)
        .filter(bucket => bucket.t + intervalMs > (query.from ?? Number.NEGATIVE_INFINITY) && bucket.t < (query.to ?? Number.POSITIVE_INFINITY))
      return { ...day, intervalMs, buckets }
    })
    const allBuckets = days.flatMap(day => day.buckets)
    const first = allBuckets.at(0)
    const last = allBuckets.at(-1)
    const from = query.from ?? first?.t ?? this.now()
    const to = query.to ?? (last === undefined ? from : last.t + intervalMs)
    return {
      schemaVersion: BARS_SCHEMA_VERSION,
      channel: BARS_CHANNELS[0],
      timezone: this.timezone,
      interval,
      businessDate: this.accumulator?.businessDate ?? this.businessDateOf(this.now()),
      from,
      to,
      days,
      meta: this.meta(listed),
    }
  }

  /**
   * Render one window as a standalone SVG. Same geometry the browser uses, so a
   * candle can never sit in a different place here than in the panel.
   * @param query - validated query.
   * @param options - viewport and theme, already clamped by the route layer.
   */
  svg(query: BarsQuery, options: { width: number; height: number; theme: 'light' | 'dark' }): string {
    const payload = this.read(query)
    const candles: BarsCandle[] = payload.days.flatMap(day => day.buckets)
    const geometry = layoutBars(candles, {
      width: options.width,
      height: options.height,
      intervalMs: BARS_INTERVAL_MS[payload.interval],
    })
    const hasGap = candles.some(candle => candle.gap)
    return renderBarsSvg({
      geometry,
      width: options.width,
      height: options.height,
      theme: options.theme,
      title: `梁位走势 ${payload.businessDate}`,
      subtitle: `本机观察 · ${payload.interval} · ${payload.timezone}`,
      footer: hasGap ? '未统计区间不补线，期间投票仍计入累计' : null,
      emptyText: '这一天还没有观察记录',
      gapLabel: '未统计',
      formatTime: (t: number) => this.formatTime(t, payload.interval),
      formatRatio: (value: number) => `${(Math.trunc(value * 10_000) / 100).toFixed(2)}%`,
    })
  }

  private formatTime(t: number, interval: BarsInterval): string {
    const options: Intl.DateTimeFormatOptions = interval === '1d'
      ? { timeZone: this.timezone, month: '2-digit', day: '2-digit' }
      : { timeZone: this.timezone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    return new Intl.DateTimeFormat('en-CA', options).format(new Date(t))
  }

  private loadDays(query: BarsQuery, listed: string[]): BarsDay[] {
    const today = this.accumulator
    const wanted: string[] = []
    wanted.push(...new Set([...listed, ...this.pendingWrites.keys()].filter(date => this.inWindow(date, query))))
    if (today !== null && this.inWindow(today.businessDate, query) && !wanted.includes(today.businessDate)) {
      wanted.push(today.businessDate)
    }
    const loaded: BarsDay[] = []
    for (const date of wanted.sort().slice(-BARS_MAX_WINDOW_DAYS)) {
      if (today !== null && date === today.businessDate) {
        loaded.push(this.currentDay(today))
        continue
      }
      let stamp = ''
      try { const file = statSync(barsDayPath(this.root, date)); stamp = `${file.mtimeMs}:${file.ctimeMs}:${file.size}` } catch { /* read reports missing/corrupt files */ }
      const cached = this.closedCache.get(date)
      const day = this.pendingWrites.get(date) ?? (stamp !== '' && cached?.stamp === stamp ? cached.day : readBarsDay(this.root, date, this.warn))
      if (day !== null && stamp !== '') this.closedCache.set(date, { stamp, day })
      while (this.closedCache.size > BARS_MAX_WINDOW_DAYS) this.closedCache.delete(this.closedCache.keys().next().value!)
      if (day !== null) loaded.push(day)
    }
    return loaded.toSorted((a, b) => a.businessDate.localeCompare(b.businessDate))
  }

  private inWindow(date: string, query: BarsQuery): boolean {
    const fromDate = query.from === null ? null : this.businessDateOf(query.from)
    const toDate = query.to === null ? null : this.businessDateOf(query.to)
    if (fromDate !== null && date < fromDate) return false
    if (toDate !== null && date > toDate) return false
    return true
  }

  private businessDateOf(t: number): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.timezone }).format(new Date(t))
  }

  /** Where today's file lives; exposed for diagnostics and tests. */
  get directory(): string {
    return this.root
  }

  /** Stop sampling and seal today's file. */
  dispose(): void {
    this.disposed = true
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.flush()
  }
}

/** What the recorder needs from the Host service, kept narrow for tests. */
export interface BarsRecorderWiring {
  getWireState: () => LiangxiangWireState
  timezone: string
  warn: (message: string) => void
  env?: NodeJS.ProcessEnv
  home?: string
  now?: () => number
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const value = Number(raw.trim())
  if (!Number.isSafeInteger(value) || value <= 0) return fallback
  return value
}

/**
 * Build the recorder from the Host environment.
 * `LIANGXIANG_BARS=0` disables the chart entirely; sampling granularity and
 * storage root stay configurable so tests never touch a real profile.
 * @param wiring - service accessor plus the resolved business timezone.
 * @returns a recorder, or `null` when the chart is switched off.
 */
export function createBarsRecorder(wiring: BarsRecorderWiring): BarsRecorder | null {
  const env = wiring.env ?? process.env
  if (env.LIANGXIANG_BARS?.trim() === '0') return null
  const home = wiring.home ?? homedir()
  return new BarsRecorder({
    root: resolveBarsRoot(env, home),
    timezone: wiring.timezone,
    sampleMs: positiveInt(env.LIANGXIANG_BARS_SAMPLE_MS, DEFAULT_BARS_SAMPLE_MS),
    flushMs: positiveInt(env.LIANGXIANG_BARS_FLUSH_MS, DEFAULT_BARS_FLUSH_MS),
    ...(wiring.now === undefined ? {} : { now: wiring.now }),
    warn: wiring.warn,
    readState: () => {
      try {
        return wiring.getWireState()
      } catch {
        // Boot window: no state yet. Not an outage on its own — the gap
        // detector only fires once a sample has actually been recorded.
        return null
      }
    },
  })
}
