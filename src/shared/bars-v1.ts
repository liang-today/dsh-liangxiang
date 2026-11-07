/**
 * `/liangxiang/api/bars*` wire contract — 走势 (K 线).
 *
 * The chart is a DERIVED, READ-ONLY projection of what THIS Host observed.
 * It is not a ledger, it never authorizes a vote, and it never changes 梁位.
 *
 * Two consequences shape the whole contract:
 *
 * - There is no "online chart". The community backend owns the vote ledger and
 *   exposes no per-second series, so the only thing this Host can draw is its
 *   own sampling of `state`. A missing stretch means "we did not look", never
 *   "nothing happened" — hence `BarsGap` is a first-class field, not an error.
 * - Every number here is cumulative-per-case. When the operator archives a
 *   case and opens another one on the same date the counts restart, so a case
 *   change is a hard break in the series (`breaks`), never a bridge.
 */
export const BARS_SCHEMA_VERSION = 1 as const

/**
 * Durable bucket width. One business day carries at most 1440 of them: minute
 * granularity is what makes a 15-minute window readable as 15 candles.
 */
export const BARS_BUCKET_MS = 60_000

/**
 * Selectable chart intervals, aggregated from durable one-minute buckets.
 */
export const BARS_INTERVALS = ['1m', '5m', '15m', '1h', '1d'] as const

export type BarsInterval = (typeof BARS_INTERVALS)[number]

/** Millisecond width of each selectable interval. */
export const BARS_INTERVAL_MS: Record<BarsInterval, number> = {
  '1m': BARS_BUCKET_MS,
  '5m': 5 * BARS_BUCKET_MS,
  '15m': 15 * BARS_BUCKET_MS,
  '1h': 60 * BARS_BUCKET_MS,
  '1d': 24 * 60 * 60_000,
}

/**
 * Which observation channel produced a payload. Only one channel exists today;
 * it is carried on the wire so a future source can never be mistaken for it.
 */
export const BARS_CHANNELS = ['host-observation'] as const

export type BarsChannel = (typeof BARS_CHANNELS)[number]

/** `host-down` covers intervals without a live Host authority observation. */
export const BARS_GAP_REASONS = ['host-down'] as const

export type BarsGapReason = (typeof BARS_GAP_REASONS)[number]

export interface BarsGap {
  /** Last observed timestamp before the silence. */
  from: number
  /** First observed timestamp after the silence. */
  to: number
  reason: BarsGapReason
}

/**
 * One candle. `open/high/low/close` are 梁位 as a 0..1 fraction, truncated for
 * display by the renderer only; `null` means the bucket holds no sample at all
 * (an outage or a stretch before the case opened).
 */
export interface BarsCandle {
  /** Bucket start, epoch ms (UTC-aligned). */
  t: number
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  /** Cumulative accepted votes at `close`. */
  upVotes: number
  downVotes: number
  /** Samples folded into this bucket; 0 marks an empty bucket. */
  samples: number
  caseId: string | null
  /** True when the bucket sits inside a recorded outage. */
  gap: boolean
}

export interface BarsCaseSpan {
  caseId: string
  title: string
  from: number
  to: number | null
}

/** One business date of durable bars. Stored as its own JSON file. */
export interface BarsDay {
  businessDate: string
  intervalMs: number
  buckets: BarsCandle[]
  gaps: BarsGap[]
  cases: BarsCaseSpan[]
  /** Timestamps where the active case changed; the series never bridges these. */
  breaks: number[]
  policyVersions: string[]
  firstSampleAt: number
  lastSampleAt: number
  closedAt: number | null
}

/** `/bars` response. */
export interface BarsPayload {
  schemaVersion: typeof BARS_SCHEMA_VERSION
  channel: BarsChannel
  timezone: string
  interval: BarsInterval
  businessDate: string
  /** Requested window, clamped to what exists. */
  from: number
  to: number
  days: BarsDay[]
  meta: BarsMeta
}

/** What a caller can ask for, so nobody has to guess the retained range. */
export interface BarsMeta {
  schemaVersion: typeof BARS_SCHEMA_VERSION
  channel: BarsChannel
  timezone: string
  bucketMs: number
  intervals: readonly BarsInterval[]
  /** Retention is one file per business date; this lists what is readable. */
  days: string[]
  newestAt: number | null
}

export interface BarsQuery {
  from: number | null
  to: number | null
  interval: BarsInterval
}

const BARS_INTERVAL_SET = new Set<string>(BARS_INTERVALS)

export function isBarsInterval(value: unknown): value is BarsInterval {
  return typeof value === 'string' && BARS_INTERVAL_SET.has(value)
}

/** Non-negative safe integer from a query string, or `null` when absent. */
function parseEpoch(raw: string | null, label: string): number | null {
  if (raw === null || raw === '') return null
  if (!/^\d+$/.test(raw)) throw new Error(`${label} must be a non-negative integer epoch millisecond`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeds the safe integer range`)
  return value
}

/**
 * Validate the `/bars` and `/bars.svg` query string.
 * @param search - the raw `URLSearchParams` of the request.
 * @returns a clamped, validated window plus the chosen interval.
 */
export function parseBarsQuery(search: URLSearchParams): BarsQuery {
  let from: number | null = null
  let to: number | null = null
  let interval: BarsInterval = '5m'
  for (const key of search.keys()) {
    if (key !== 'from' && key !== 'to' && key !== 'interval') throw new Error(`unknown query parameter ${key}`)
    if (search.getAll(key).length > 1) throw new Error(`${key} must appear at most once`)
  }
  from = parseEpoch(search.get('from'), 'from')
  to = parseEpoch(search.get('to'), 'to')
  const rawInterval = search.get('interval')
  if (rawInterval !== null && rawInterval !== '') {
    if (!isBarsInterval(rawInterval)) throw new Error(`interval must be one of ${BARS_INTERVALS.join(', ')}`)
    interval = rawInterval
  }
  if (from !== null && to !== null && from > to) throw new Error('from must not be later than to')
  return { from, to, interval }
}
