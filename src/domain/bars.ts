/**
 * 走势 (K 线) domain: pure folding of what the Host observed into candles, and
 * pure geometry into drawable coordinates.
 *
 * Nothing here knows about HTTP, storage or React. Both renderers (the server
 * SVG string and the browser overlay) consume the SAME geometry output, so the
 * two can never disagree about where a candle sits — that is the point of
 * keeping layout in one place.
 *
 * Invariants (tests/domain-bars.spec.ts):
 * - `open` of a bucket is the previous bucket's `close`; the series is
 *   continuous inside one case and never bridged across a case change.
 * - A bucket with no samples stays empty (`null` ratios) and is flagged `gap`
 *   only when it really sits inside a recorded outage. Zero votes does not make
 *   a gap: it renders as the 待开梁 placeholder line.
 * - A gap means "not looked at", never "nothing happened".
 */
import type {
  BarsCaseSpan,
  BarsCandle,
  BarsDay,
  BarsGap,
} from '../shared/bars-v1.ts'

/** One observation. The Host samples its own wire state at this granularity. */
export interface BarsSample {
  t: number
  upVotes: number
  downVotes: number
  caseId: string
  caseTitle: string
  policyVersion: string | null
}

/**
 * Silence longer than this is recorded as an outage. Three missed samples
 * covers a slow tick without inventing gaps on a busy event loop.
 */
export const BARS_GAP_FLOOR_MS = 30_000

export function barsGapThresholdMs(sampleMs: number): number {
  return Math.max(3 * sampleMs, BARS_GAP_FLOOR_MS)
}

export interface BarsAccumulator {
  businessDate: string
  intervalMs: number
  gapThresholdMs: number
  buckets: BarsCandle[]
  gaps: BarsGap[]
  cases: BarsCaseSpan[]
  breaks: number[]
  policyVersions: string[]
  firstSampleAt: number
  lastSampleAt: number
  lastClose: number | null
}

export interface BarsAccumulatorInit {
  businessDate: string
  intervalMs: number
  sampleMs: number
}

export function createBarsAccumulator(init: BarsAccumulatorInit): BarsAccumulator {
  return {
    businessDate: init.businessDate,
    intervalMs: init.intervalMs,
    gapThresholdMs: barsGapThresholdMs(init.sampleMs),
    buckets: [],
    gaps: [],
    cases: [],
    breaks: [],
    policyVersions: [],
    firstSampleAt: 0,
    lastSampleAt: 0,
    lastClose: null,
  }
}

/** 梁位 as a 0..1 fraction; `null` while the case has no accepted vote. */
export function barsRatio(upVotes: number, downVotes: number): number | null {
  const total = upVotes + downVotes
  if (total <= 0) return null
  return upVotes / total
}

export function barsBucketStart(t: number, intervalMs: number): number {
  return Math.floor(t / intervalMs) * intervalMs
}

function bucketAt(acc: BarsAccumulator, start: number): BarsCandle | null {
  const last = acc.buckets.at(-1)
  if (last !== undefined && last.t === start) return last
  return null
}

function openBucket(acc: BarsAccumulator, start: number, sample: BarsSample, ratio: number | null): BarsCandle {
  const bucket: BarsCandle = {
    t: start,
    open: ratio ?? acc.lastClose,
    high: ratio,
    low: ratio,
    close: ratio,
    upVotes: sample.upVotes,
    downVotes: sample.downVotes,
    samples: 0,
    caseId: sample.caseId,
    gap: false,
  }
  acc.buckets.push(bucket)
  return bucket
}

function noteCase(acc: BarsAccumulator, sample: BarsSample): void {
  const current = acc.cases.at(-1)
  if (current !== undefined && current.caseId === sample.caseId) {
    if (current.to !== null) current.to = null
    return
  }
  if (current !== undefined) current.to = sample.t
  acc.cases.push({ caseId: sample.caseId, title: sample.caseTitle, from: sample.t, to: null })
  if (acc.buckets.length > 0) {
    // Counts restart at zero in a new case; bridging would draw a fake plunge.
    acc.breaks.push(sample.t)
  }
}

function notePolicy(acc: BarsAccumulator, policyVersion: string | null): void {
  if (policyVersion === null) return
  if (!acc.policyVersions.includes(policyVersion)) acc.policyVersions.push(policyVersion)
}

/**
 * Fold one observation into the accumulator. Monotonic timestamps are the
 * caller's contract: the recorder samples its own clock, never a client claim.
 * @param acc - accumulator to mutate.
 * @param sample - observed counts and case identity.
 */
export function accrueBarsSample(acc: BarsAccumulator, sample: BarsSample): void {
  if (!Number.isSafeInteger(sample.t) || sample.t <= 0) throw new Error('bars sample t must be a positive epoch millisecond')
  if (acc.lastSampleAt !== 0 && sample.t < acc.lastSampleAt) {
    throw new Error('bars samples must arrive in non-decreasing order')
  }
  noteCase(acc, sample)
  notePolicy(acc, sample.policyVersion)
  if (acc.firstSampleAt === 0) acc.firstSampleAt = sample.t

  if (acc.lastSampleAt !== 0 && sample.t - acc.lastSampleAt > acc.gapThresholdMs) {
    acc.gaps.push({ from: acc.lastSampleAt, to: sample.t, reason: 'host-down' })
  }

  const ratio = barsRatio(sample.upVotes, sample.downVotes)
  const start = barsBucketStart(sample.t, acc.intervalMs)
  const bucket = bucketAt(acc, start) ?? openBucket(acc, start, sample, ratio)
  if (bucket.t !== start) {
    // Unreachable: bucketAt only returns the tail, openBucket already used start.
    throw new Error('bars bucket bookkeeping diverged')
  }
  if (bucket.samples === 0 || bucket.close === null) {
    bucket.open = ratio ?? acc.lastClose
    bucket.high = ratio
    bucket.low = ratio
    bucket.close = ratio
  } else if (ratio !== null) {
    bucket.high = bucket.high === null ? ratio : Math.max(bucket.high, ratio)
    bucket.low = bucket.low === null ? ratio : Math.min(bucket.low, ratio)
    bucket.close = ratio
  }
  bucket.upVotes = sample.upVotes
  bucket.downVotes = sample.downVotes
  bucket.samples += 1
  if (ratio !== null) acc.lastClose = ratio
  acc.lastSampleAt = sample.t
}

function overlapsGap(bucket: BarsCandle, gap: BarsGap, intervalMs: number): boolean {
  const end = bucket.t + intervalMs
  return bucket.t < gap.to && end > gap.from
}

/**
 * Mark empty buckets that sit inside an outage. Idempotent; call before
 * persisting or serving.
 * @param acc - accumulator to finalize.
 */
export function finalizeBarsBuckets(acc: BarsAccumulator): void {
  for (const bucket of acc.buckets) {
    bucket.gap = bucket.samples === 0
      && acc.gaps.some(gap => overlapsGap(bucket, gap, acc.intervalMs))
  }
  if (acc.gaps.length === 0) return
  // An outage has no samples, so it owns no bucket of its own. Materialize the
  // empty buckets it covers: the axis then shows the real width of the silence
  // and the renderer can draw the dashed 未统计 band over it.
  const missing: BarsCandle[] = []
  for (const gap of acc.gaps) {
    let t = barsBucketStart(gap.from, acc.intervalMs)
    while (t < gap.to) {
      const existing = acc.buckets.find(bucket => bucket.t === t)
      if (existing === undefined) {
        missing.push({
          t,
          open: null,
          high: null,
          low: null,
          close: null,
          upVotes: 0,
          downVotes: 0,
          samples: 0,
          caseId: acc.cases.find(span => span.from <= t && (span.to === null || span.to > t))?.caseId ?? '',
          gap: true,
        })
      }
      t += acc.intervalMs
    }
  }
  if (missing.length > 0) {
    acc.buckets = [...acc.buckets, ...missing].sort((left, right) => left.t - right.t)
  }
}

/**
 * Snapshot the accumulator as the durable day shape. The caller persists it.
 * @param acc - finalized accumulator.
 * @returns a JSON-safe day record.
 */
export function toBarsDay(acc: BarsAccumulator, closedAt: number | null): BarsDay {
  finalizeBarsBuckets(acc)
  return {
    businessDate: acc.businessDate,
    intervalMs: acc.intervalMs,
    buckets: acc.buckets.map(bucket => ({ ...bucket })),
    gaps: acc.gaps.map(gap => ({ ...gap })),
    cases: acc.cases.map(span => ({ ...span })),
    breaks: [...acc.breaks],
    policyVersions: [...acc.policyVersions],
    firstSampleAt: acc.firstSampleAt,
    lastSampleAt: acc.lastSampleAt,
    closedAt,
  }
}

/** Restore an accumulator from a persisted day (restart continuity). */
export function fromBarsDay(day: BarsDay, sampleMs: number): BarsAccumulator {
  return {
    businessDate: day.businessDate,
    intervalMs: day.intervalMs,
    gapThresholdMs: barsGapThresholdMs(sampleMs),
    buckets: day.buckets.map(bucket => ({ ...bucket })),
    gaps: day.gaps.map(gap => ({ ...gap })),
    cases: day.cases.map(span => ({ ...span })),
    breaks: [...day.breaks],
    policyVersions: [...day.policyVersions],
    firstSampleAt: day.firstSampleAt,
    lastSampleAt: day.lastSampleAt,
    lastClose: day.buckets.at(-1)?.close ?? null,
  }
}

/**
 * Merge 5-minute source buckets into a wider display interval. Aggregation is
 * by raw counts and extremes — never by averaging ratios.
 * @param buckets - source buckets in ascending order.
 * @param sourceMs - width of the source buckets.
 * @param targetMs - width of the requested interval.
 */
export function aggregateBars(buckets: readonly BarsCandle[], sourceMs: number, targetMs: number): BarsCandle[] {
  if (targetMs <= sourceMs) return buckets.map(bucket => ({ ...bucket }))
  const out: BarsCandle[] = []
  for (const bucket of buckets) {
    const slot = barsBucketStart(bucket.t, targetMs)
    const last = out.at(-1)
    if (last === undefined || last.t !== slot) {
      out.push({
        t: slot,
        open: bucket.open,
        high: bucket.high,
        low: bucket.low,
        close: bucket.close,
        upVotes: bucket.upVotes,
        downVotes: bucket.downVotes,
        samples: bucket.samples,
        caseId: bucket.caseId,
        gap: bucket.gap,
      })
      continue
    }
    if (bucket.samples > 0) {
      if (last.samples === 0) {
        last.open = bucket.open
        last.high = bucket.high
        last.low = bucket.low
      } else {
        if (bucket.high !== null) last.high = last.high === null ? bucket.high : Math.max(last.high, bucket.high)
        if (bucket.low !== null) last.low = last.low === null ? bucket.low : Math.min(last.low, bucket.low)
      }
      last.close = bucket.close
      last.samples += bucket.samples
      last.caseId = bucket.caseId
      last.gap = last.gap && bucket.gap
    }
    last.upVotes = bucket.upVotes
    last.downVotes = bucket.downVotes
  }
  return out
}

export interface BarsGeometryOptions {
  width: number
  height: number
  /** Minimum visible 梁位 span (0..1) so a flat case is not a hairline. */
  minSpan?: number
  /** Ratio padding above and below the extremes. */
  paddingRatio?: number
  intervalMs: number
}

export interface BarsColumn {
  x: number
  width: number
  candle: BarsCandle
}

export interface BarsPoint {
  x: number
  y: number
}

export interface BarsSegment {
  points: BarsPoint[]
}

export interface BarsGeometry {
  plot: { left: number; top: number; width: number; height: number }
  columns: BarsColumn[]
  yTicks: { y: number; value: number }[]
  xTicks: { x: number }[]
  /** Close-price path, split at outages and case changes. */
  segments: BarsSegment[]
  domain: { low: number; high: number }
  /** Time window the x axis actually covers, for tick labels. */
  window: { start: number; end: number }
}

export const BARS_AXIS_GUTTER = { left: 4, right: 46, top: 10, bottom: 18 } as const

/**
 * Turn candles into coordinates. Time-proportional x so an outage occupies the
 * width it really took; a candle never gets narrower than one pixel.
 * @param candles - ascending candles for one window.
 * @param options - viewport and scale knobs.
 */
export function layoutBars(candles: readonly BarsCandle[], options: BarsGeometryOptions): BarsGeometry {
  const paddingRatio = options.paddingRatio ?? 0.12
  const minSpan = options.minSpan ?? 0.02
  const { width, height, intervalMs } = options
  const plot = {
    left: BARS_AXIS_GUTTER.left,
    top: BARS_AXIS_GUTTER.top,
    width: Math.max(1, width - BARS_AXIS_GUTTER.left - BARS_AXIS_GUTTER.right),
    height: Math.max(1, height - BARS_AXIS_GUTTER.top - BARS_AXIS_GUTTER.bottom),
  }
  const valued = candles.filter(candle => candle.high !== null && candle.low !== null)
  let low = 0.5
  let high = 0.5
  if (valued.length > 0) {
    low = Math.min(...valued.map(candle => candle.low as number))
    high = Math.max(...valued.map(candle => candle.high as number))
  }
  const span = Math.max(high - low, minSpan)
  const center = (low + high) / 2
  low = Math.max(0, center - span / 2 - span * paddingRatio)
  high = Math.min(1, center + span / 2 + span * paddingRatio)
  if (high - low < minSpan) {
    // Clamping at 0/1 can re-squeeze a domain that sat at an extreme.
    if (low === 0) high = Math.min(1, low + minSpan)
    else low = Math.max(0, high - minSpan)
  }
  const first = candles.at(0)
  const last = candles.at(-1)
  const start = first?.t ?? 0
  const end = last === undefined ? start + intervalMs : last.t + intervalMs
  const timeSpan = Math.max(intervalMs, end - start)
  const xOf = (t: number): number => plot.left + ((t - start) / timeSpan) * plot.width
  const slotWidth = (intervalMs / timeSpan) * plot.width
  const yOf = (value: number): number => plot.top + ((high - value) / (high - low)) * plot.height

  const columns: BarsColumn[] = candles.map(candle => {
    const raw = xOf(candle.t)
    const x = Math.min(plot.left + plot.width - 1, Math.max(plot.left, raw))
    const next = Math.min(plot.left + plot.width, x + slotWidth)
    return { x, width: Math.max(1, next - x), candle }
  })

  const yTicks: { y: number; value: number }[] = []
  const tickCount = 4
  for (let index = 0; index <= tickCount; index += 1) {
    const value = low + ((high - low) * index) / tickCount
    yTicks.push({ y: yOf(value), value })
  }

  const xTicks: { x: number }[] = []
  const xTickCount = 5
  for (let index = 0; index <= xTickCount; index += 1) {
    xTicks.push({ x: plot.left + (plot.width * index) / xTickCount })
  }

  const segments: BarsSegment[] = []
  let current: BarsPoint[] = []
  const breakSet = new Set<number>()
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1] as BarsCandle
    const candle = candles[index] as BarsCandle
    if ((previous.caseId ?? '') !== (candle.caseId ?? '')) breakSet.add(candle.t)
  }
  for (const column of columns) {
    const { candle } = column
    const broken = breakSet.has(candle.t)
    if (candle.close === null || candle.gap) {
      if (current.length > 1) segments.push({ points: current })
      current = []
      continue
    }
    if (broken && current.length > 1) {
      segments.push({ points: current })
      current = []
    }
    const x = column.x + column.width / 2
    if (current.length === 0) {
      const open = candle.open ?? candle.close
      current.push({ x, y: yOf(open) })
    }
    current.push({ x, y: yOf(candle.close) })
  }
  if (current.length > 1) segments.push({ points: current })

  return { plot, columns, yTicks, xTicks, segments, domain: { low, high }, window: { start, end } }
}
