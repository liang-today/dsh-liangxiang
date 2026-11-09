/** Community game contract. The Linux ledger is authoritative; usage remains soft trust. */
import { isMarketRuleVersion, type MarketRuleVersion } from '../domain/market.ts'
export { MARKET_RULE_VERSION, MARKET_LEGACY_RULE_VERSION, MARKET_PREVIOUS_RULE_VERSION, MARKET_BATCH_HOURS, type MarketRuleVersion } from '../domain/market.ts'
export const MARKET_SCHEMA_VERSION = 1 as const
export const MARKET_CANDLE_INTERVAL_MS = 60_000
export const MARKET_LEGACY_CANDLE_INTERVAL_MS = 300_000
export type MarketCandleIntervalMs = typeof MARKET_CANDLE_INTERVAL_MS | typeof MARKET_LEGACY_CANDLE_INTERVAL_MS
/** A DST business day may contain 25 hours; pages remain bounded separately. */
export const MARKET_CANDLES_DAY_MAX = 1_500
export const MARKET_CANDLES_PAGE_MAX = 288
export const MARKET_HISTORY_PAGE_DEFAULT = 20
export const MARKET_HISTORY_PAGE_MAX = 50
export const MARKET_CACHE_MAX_BYTES = 2 * 1024 * 1024
export const MARKET_CACHE_MAX_DAYS = 7
export const MARKET_CACHE_MAX_RECEIPTS = 30
export const MARKET_AMOUNT_MAX = 1_000_000

export type MarketSide = 'long' | 'short'
export type MarketBatchId = 1 | 2 | 3
export type MarketResult = MarketSide | 'draw' | 'void'

export interface MarketWallet {
  available_incense: number
  frozen_incense: number
  total_incense: number
  token_remainder: number
  token_per_incense: number
  version: number
}

export interface MarketPoint {
  case_id: string
  at: number
  up_votes: number
  down_votes: number
  sequence: number
}

export interface MarketPosition {
  side: MarketSide
  amount: number
  submitted_at: number
  payout: number | null
}

export interface MarketBatch {
  batch: MarketBatchId
  opens_at: number
  locks_at: number
  reference_at: number
  status: 'pending' | 'open' | 'locked' | 'live' | 'settled' | 'void'
  reference: MarketPoint | null
  long_incense: number
  short_incense: number
  position: MarketPosition | null
  result: MarketResult | null
}

export interface DailyMarket {
  id: string
  case_id: string
  business_date: string
  timezone: string
  rule_version: MarketRuleVersion
  opens_at: number
  closes_at: number
  status: 'open' | 'closed' | 'cancelled'
  batches: MarketBatch[]
  close_point: MarketPoint | null
}

export interface MarketState {
  schema_version: typeof MARKET_SCHEMA_VERSION
  server_time: number
  soft_trust: true
  wallet: MarketWallet
  market: DailyMarket | null
  current_point: MarketPoint | null
  current_candle?: MarketCandle
  candle_interval_ms?: MarketCandleIntervalMs
}

/** Set the whole position, not a delta. Zero amount cancels before the cutoff. */
export interface MarketPositionRequest {
  market_id: string
  batch: MarketBatchId
  side: MarketSide | null
  amount: number
  request_id: string
}

export interface MarketPositionResponse {
  accepted: boolean
  reason: string | null
  request_id: string
  state: MarketState
}

export interface MarketCandle {
  at: number
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  up_votes: number
  down_votes: number
  volume: number
}

export interface MarketCandlesResponse {
  schema_version: typeof MARKET_SCHEMA_VERSION
  case_id: string
  business_date: string
  interval_ms: MarketCandleIntervalMs
  candles: MarketCandle[]
  next_cursor: string | null
}

export interface MarketReceiptBatch {
  batch: MarketBatchId
  side: MarketSide
  amount: number
  payout: number
  result: MarketResult
  reference: MarketPoint | null
}

export interface MarketReceipt {
  id: string
  market_id: string
  /** Absent in early candidate receipts; never fabricated while reading them. */
  rule_version?: string
  business_date: string
  settled_at: number
  invested_incense: number
  returned_incense: number
  pnl_incense: number
  close_point: MarketPoint | null
  batches: MarketReceiptBatch[]
}

export interface MarketHistoryResponse {
  schema_version: typeof MARKET_SCHEMA_VERSION
  receipts: MarketReceipt[]
  next_cursor: string | null
}

/** Snapshot is the existing /v1/snapshot envelope, parsed by its own validator. */
export interface MarketStreamEvent {
  schema_version: typeof MARKET_SCHEMA_VERSION
  epoch: string
  revision: number
  server_time: number
  snapshot?: unknown
  market_state?: MarketState
  candle?: MarketCandle
  candle_interval_ms?: MarketCandleIntervalMs
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid ${name}`)
  return value as Record<string, unknown>
}

function integer(value: unknown, name: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new Error(`invalid ${name}`)
  return value
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new Error(`invalid ${name}`)
  return value
}

function choice<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (!values.includes(value as T)) throw new Error(`invalid ${name}`)
  return value as T
}

function batchId(value: unknown): MarketBatchId {
  if (value !== 1 && value !== 2 && value !== 3) throw new Error('invalid market batch')
  return value
}

export function parseMarketWallet(value: unknown): MarketWallet {
  const v = object(value, 'wallet')
  const wallet: MarketWallet = {
    available_incense: integer(v.available_incense, 'available incense'),
    frozen_incense: integer(v.frozen_incense, 'frozen incense'),
    total_incense: integer(v.total_incense, 'total incense'),
    token_remainder: integer(v.token_remainder, 'token remainder'),
    token_per_incense: integer(v.token_per_incense, 'token threshold', 1),
    version: integer(v.version, 'wallet version'),
  }
  if (wallet.total_incense !== wallet.available_incense + wallet.frozen_incense
    || wallet.token_remainder >= wallet.token_per_incense) throw new Error('inconsistent wallet')
  return wallet
}

export function parseMarketPoint(value: unknown): MarketPoint {
  const v = object(value, 'market point')
  const point = { case_id: text(v.case_id, 'point case'), at: integer(v.at, 'point time'),
    up_votes: integer(v.up_votes, 'point up'), down_votes: integer(v.down_votes, 'point down'),
    sequence: integer(v.sequence, 'point sequence') }
  if (!Number.isSafeInteger(point.up_votes + point.down_votes)) throw new Error('unsafe point total')
  return point
}

function nullablePoint(value: unknown): MarketPoint | null {
  return value === null ? null : parseMarketPoint(value)
}

function position(value: unknown): MarketPosition | null {
  if (value === null) return null
  const v = object(value, 'position')
  return { side: choice(v.side, ['long', 'short'], 'position side'), amount: integer(v.amount, 'position amount', 1),
    submitted_at: integer(v.submitted_at, 'position time'), payout: v.payout === null ? null : integer(v.payout, 'position payout') }
}

function parseBatch(value: unknown): MarketBatch {
  const v = object(value, 'batch')
  return { batch: batchId(v.batch), opens_at: integer(v.opens_at, 'batch open'), locks_at: integer(v.locks_at, 'batch lock'),
    reference_at: integer(v.reference_at, 'batch reference time'),
    status: choice(v.status, ['pending', 'open', 'locked', 'live', 'settled', 'void'], 'batch status'),
    reference: nullablePoint(v.reference), long_incense: integer(v.long_incense, 'long pool'),
    short_incense: integer(v.short_incense, 'short pool'), position: position(v.position),
    result: v.result === null ? null : choice<MarketResult>(v.result, ['long', 'short', 'draw', 'void'], 'batch result') }
}

export function parseMarketState(value: unknown): MarketState {
  const v = object(value, 'market state')
  if (v.schema_version !== MARKET_SCHEMA_VERSION || v.soft_trust !== true) throw new Error('unsupported market state')
  let market: DailyMarket | null = null
  if (v.market !== null) {
    const m = object(v.market, 'daily market')
    if (!isMarketRuleVersion(m.rule_version) || !Array.isArray(m.batches) || m.batches.length !== 3) throw new Error('invalid market policy')
    const batches = m.batches.map(parseBatch)
    if (new Set(batches.map(b => b.batch)).size !== 3) throw new Error('duplicate market batch')
    market = { id: text(m.id, 'market id'), case_id: text(m.case_id, 'market case'), business_date: text(m.business_date, 'business date'),
      timezone: text(m.timezone, 'business timezone'), rule_version: m.rule_version,
      opens_at: integer(m.opens_at, 'market open'), closes_at: integer(m.closes_at, 'market close'),
      status: choice(m.status, ['open', 'closed', 'cancelled'], 'market status'), batches, close_point: nullablePoint(m.close_point) }
    if (market.closes_at <= market.opens_at || batches.some(b => b.opens_at >= b.locks_at || b.locks_at >= b.reference_at
      || b.reference_at >= market!.closes_at || (b.reference !== null && b.reference.case_id !== market!.case_id))
      || (market.close_point !== null && market.close_point.case_id !== market.case_id)) throw new Error('inconsistent market timeline')
  }
  return { schema_version: MARKET_SCHEMA_VERSION, server_time: integer(v.server_time, 'server time'), soft_trust: true,
    wallet: parseMarketWallet(v.wallet), market, current_point: nullablePoint(v.current_point),
    ...(v.current_candle === undefined ? {} : { current_candle: parseMarketCandle(v.current_candle) }),
    ...(v.current_candle === undefined && v.candle_interval_ms === undefined ? {} : {
      candle_interval_ms: parseMarketCandleInterval(v.candle_interval_ms ?? MARKET_LEGACY_CANDLE_INTERVAL_MS) }) }
}

export function parseMarketPositionRequest(value: unknown): MarketPositionRequest {
  const v = object(value, 'position request')
  const allowed = new Set(['market_id', 'batch', 'side', 'amount', 'request_id'])
  if (Object.keys(v).some(key => !allowed.has(key))) throw new Error('unexpected position field')
  const amount = integer(v.amount, 'position amount')
  if (amount > MARKET_AMOUNT_MAX) throw new Error('market amount exceeds maximum')
  const side = v.side === null ? null : choice(v.side, ['long', 'short'], 'position direction')
  if ((amount === 0) !== (side === null)) throw new Error('cancellation requires zero amount and null side')
  return { market_id: text(v.market_id, 'market id'), batch: batchId(v.batch), side, amount, request_id: text(v.request_id, 'request id') }
}

export function parseMarketPositionResponse(value: unknown): MarketPositionResponse {
  const v = object(value, 'position response')
  if (typeof v.accepted !== 'boolean') throw new Error('invalid position result')
  return { accepted: v.accepted, reason: v.reason === null ? null : text(v.reason, 'position reason'),
    request_id: text(v.request_id, 'request id'), state: parseMarketState(v.state) }
}

export function parseMarketCandle(value: unknown): MarketCandle {
  const ratio = (n: unknown): number | null => {
    if (n === null) return null
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) throw new Error('invalid candle ratio')
    return n
  }
  const c = object(value, 'candle')
  const candle: MarketCandle = { at: integer(c.at, 'candle time'), open: ratio(c.open), high: ratio(c.high), low: ratio(c.low), close: ratio(c.close),
    up_votes: integer(c.up_votes, 'candle up'), down_votes: integer(c.down_votes, 'candle down'), volume: integer(c.volume, 'candle volume') }
  if ((candle.low !== null && candle.high !== null && candle.low > candle.high)
    || [candle.open, candle.close].some(n => n !== null && (candle.low === null || candle.high === null || n < candle.low || n > candle.high))
    || !Number.isSafeInteger(candle.up_votes + candle.down_votes)) throw new Error('inconsistent candle')
  return candle
}

export function parseMarketCandlesResponse(value: unknown): MarketCandlesResponse {
  const v = object(value, 'candles')
  const interval = parseMarketCandleInterval(v.interval_ms)
  if (v.schema_version !== 1 || !Array.isArray(v.candles)
    || v.candles.length > MARKET_CANDLES_PAGE_MAX) throw new Error('invalid candles page')
  const candles = v.candles.map(parseMarketCandle)
  if (candles.some((c, i) => i > 0 && c.at <= candles[i - 1]!.at)) throw new Error('unordered candles')
  return { schema_version: 1, case_id: text(v.case_id, 'candle case'), business_date: text(v.business_date, 'candle date'),
    interval_ms: interval, candles, next_cursor: v.next_cursor === null ? null : text(v.next_cursor, 'candle cursor') }
}

export function parseMarketCandleInterval(value: unknown): MarketCandleIntervalMs {
  if (value !== MARKET_CANDLE_INTERVAL_MS && value !== MARKET_LEGACY_CANDLE_INTERVAL_MS) throw new Error('invalid candle interval')
  return value
}

export function parseMarketHistoryResponse(value: unknown): MarketHistoryResponse {
  const v = object(value, 'history')
  if (v.schema_version !== 1 || !Array.isArray(v.receipts) || v.receipts.length > MARKET_HISTORY_PAGE_MAX) throw new Error('invalid market history')
  const receipts = v.receipts.map(raw => {
    const r = object(raw, 'receipt')
    if (!Array.isArray(r.batches) || r.batches.length > 3) throw new Error('invalid receipt batches')
    const batches: MarketReceiptBatch[] = r.batches.map(rawBatch => {
      const b = object(rawBatch, 'receipt batch')
      return { batch: batchId(b.batch), side: choice(b.side, ['long', 'short'], 'receipt side'), amount: integer(b.amount, 'receipt amount', 1),
        payout: integer(b.payout, 'receipt payout'), result: choice(b.result, ['long', 'short', 'draw', 'void'], 'receipt result'), reference: nullablePoint(b.reference) }
    })
    const receipt: MarketReceipt = { id: text(r.id, 'receipt id'), market_id: text(r.market_id, 'receipt market'),
      business_date: text(r.business_date, 'receipt date'), settled_at: integer(r.settled_at, 'receipt time'),
      invested_incense: integer(r.invested_incense, 'receipt invested'), returned_incense: integer(r.returned_incense, 'receipt returned'),
      pnl_incense: integer(r.pnl_incense, 'receipt pnl', -Number.MAX_SAFE_INTEGER), close_point: nullablePoint(r.close_point), batches,
      ...(r.rule_version === undefined ? {} : { rule_version: text(r.rule_version, 'receipt rule version') }) }
    if (receipt.pnl_incense !== receipt.returned_incense - receipt.invested_incense
      || batches.reduce((n, b) => n + b.amount, 0) !== receipt.invested_incense
      || batches.reduce((n, b) => n + b.payout, 0) !== receipt.returned_incense) throw new Error('inconsistent market receipt')
    return receipt
  })
  return { schema_version: 1, receipts, next_cursor: v.next_cursor === null ? null : text(v.next_cursor, 'history cursor') }
}

export function parseMarketStreamEvent(value: unknown): MarketStreamEvent {
  const v = object(value, 'market event')
  if (v.schema_version !== 1) throw new Error('unsupported market event')
  return { schema_version: 1, epoch: text(v.epoch, 'stream epoch'), revision: integer(v.revision, 'stream revision'),
    server_time: integer(v.server_time, 'stream time'), ...(v.snapshot === undefined ? {} : { snapshot: v.snapshot }),
    ...(v.market_state === undefined ? {} : { market_state: parseMarketState(v.market_state) }),
    ...(v.candle === undefined ? {} : { candle: parseMarketCandle(v.candle),
      candle_interval_ms: parseMarketCandleInterval(v.candle_interval_ms ?? MARKET_LEGACY_CANDLE_INTERVAL_MS) }) }
}
