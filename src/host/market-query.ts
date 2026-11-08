import { isBusinessDate } from '../domain/index.ts'
import { MARKET_CANDLES_PAGE_MAX, MARKET_HISTORY_PAGE_MAX, parseMarketCandleInterval, type MarketCandleIntervalMs } from '../shared/market-v1.ts'

export interface MarketCandlesQuery {
  business_date?: string
  case_id?: string
  cursor?: string
  limit?: number
  interval_ms?: MarketCandleIntervalMs
}
export interface MarketHistoryQuery { cursor?: string, limit?: number }

function parseQuery(params: URLSearchParams, allowed: readonly string[], maximum: number): Record<string, string> {
  const output: Record<string, string> = {}
  for (const key of params.keys()) {
    if (!allowed.includes(key)) throw new Error(`unknown query parameter ${key}`)
    const values = params.getAll(key)
    if (values.length !== 1) throw new Error(`duplicate query parameter ${key}`)
    const value = values[0]!
    if (value.length === 0 || value.length > 256 || [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new Error(`invalid ${key}`)
    output[key] = value
  }
  if (output.limit !== undefined && (!/^[1-9]\d*$/.test(output.limit)
    || !Number.isSafeInteger(Number(output.limit)) || Number(output.limit) > maximum)) throw new Error('invalid page limit')
  return output
}

export function parseMarketCandlesQuery(params: URLSearchParams): MarketCandlesQuery {
  const raw = parseQuery(params, ['business_date', 'case_id', 'cursor', 'limit', 'interval_ms'], MARKET_CANDLES_PAGE_MAX)
  if (raw.business_date !== undefined && !isBusinessDate(raw.business_date)) throw new Error('invalid business date')
  if (raw.interval_ms !== undefined && !/^(60000|300000)$/.test(raw.interval_ms)) throw new Error('invalid candle interval')
  return { ...(raw.business_date === undefined ? {} : { business_date: raw.business_date }),
    ...(raw.case_id === undefined ? {} : { case_id: raw.case_id }),
    ...(raw.cursor === undefined ? {} : { cursor: raw.cursor }),
    ...(raw.limit === undefined ? {} : { limit: Number(raw.limit) }),
    ...(raw.interval_ms === undefined ? {} : { interval_ms: parseMarketCandleInterval(Number(raw.interval_ms)) }) }
}

export function parseMarketHistoryQuery(params: URLSearchParams): MarketHistoryQuery {
  const raw = parseQuery(params, ['cursor', 'limit'], MARKET_HISTORY_PAGE_MAX)
  return { ...(raw.cursor === undefined ? {} : { cursor: raw.cursor }), ...(raw.limit === undefined ? {} : { limit: Number(raw.limit) }) }
}

export function marketQuerySuffix(query: MarketCandlesQuery | MarketHistoryQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value))
  const encoded = params.toString()
  return encoded === '' ? '' : `?${encoded}`
}
