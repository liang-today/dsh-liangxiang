import {
  MARKET_CACHE_MAX_BYTES, MARKET_CACHE_MAX_DAYS, MARKET_CACHE_MAX_RECEIPTS,
  MARKET_CANDLES_DAY_MAX, MARKET_LEGACY_CANDLE_INTERVAL_MS,
  parseMarketCandle, parseMarketCandleInterval, parseMarketHistoryResponse, parseMarketPositionRequest,
  type MarketCandle, type MarketCandleIntervalMs, type MarketReceipt, type MarketPositionRequest,
} from '../../shared/market-v1.ts'

export const MARKET_ANIMATION_KEY = 'liangxiang.market.animation.v1'
export const MARKET_CACHE_KEY = 'liangxiang.market.cache.v1'
export const MARKET_PENDING_KEY = 'liangxiang.market.pending.v1'
export interface MarketStorage { getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void }
export interface CachedCandleDay { case_id: string, business_date: string, candles: MarketCandle[], interval_ms?: MarketCandleIntervalMs, complete?: boolean, synced_through?: number }
export interface MarketCache { version: 1, scope: string, candles: CachedCandleDay[], receipts: MarketReceipt[], pending: MarketPositionRequest | null }

export function emptyMarketCache(scope: string): MarketCache { return { version: 1, scope, candles: [], receipts: [], pending: null } }
export function browserMarketStorage(): MarketStorage | null { try { return globalThis.localStorage ?? null } catch { return null } }

/** UTF-16 storage cost includes the one fixed key; never retain wallet balances as authority. */
export function cacheBytes(value: string): number { return (value.length + MARKET_CACHE_KEY.length) * 2 }

export function boundedMarketCache(input: MarketCache): MarketCache {
  const candles = [...input.candles].sort((a, b) => b.business_date.localeCompare(a.business_date))
    .filter((day, i, all) => all.findIndex(other => other.case_id === day.case_id) === i)
    .slice(0, MARKET_CACHE_MAX_DAYS).map(day => ({ ...day, candles: day.candles.slice(-MARKET_CANDLES_DAY_MAX) }))
  const receipts = [...input.receipts].sort((a, b) => b.settled_at - a.settled_at)
    .filter((r, i, all) => all.findIndex(other => other.id === r.id) === i).slice(0, MARKET_CACHE_MAX_RECEIPTS)
  const cache: MarketCache = { version: 1, scope: input.scope, candles, receipts, pending: input.pending }
  while (cacheBytes(JSON.stringify(cache)) > MARKET_CACHE_MAX_BYTES - 4096 && cache.candles.length > 0) cache.candles.pop()
  while (cacheBytes(JSON.stringify(cache)) > MARKET_CACHE_MAX_BYTES - 4096 && cache.receipts.length > 0) cache.receipts.pop()
  return cache
}

export function readMarketCache(storage: MarketStorage | null, scope: string): MarketCache {
  if (!storage || !scope) return emptyMarketCache(scope)
  const empty = (): MarketCache => ({ ...emptyMarketCache(scope), pending: readMarketPending(storage, scope) })
  try {
    const raw = storage.getItem(MARKET_CACHE_KEY)
    if (!raw) return empty()
    if (cacheBytes(raw) > MARKET_CACHE_MAX_BYTES) { storage.removeItem(MARKET_CACHE_KEY); return empty() }
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object') return empty()
    const c = v as Record<string, unknown>
    if (c.version !== 1 || c.scope !== scope || !Array.isArray(c.candles)) return empty()
    const candles = c.candles.slice(0, MARKET_CACHE_MAX_DAYS).map((day: unknown) => {
      if (!day || typeof day !== 'object') throw new Error('invalid candle cache')
      const d = day as Record<string, unknown>
      if (typeof d.case_id !== 'string' || !d.case_id || d.case_id.length > 256 || typeof d.business_date !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(d.business_date) || !Array.isArray(d.candles) || d.candles.length > MARKET_CANDLES_DAY_MAX) throw new Error('invalid candle cache')
      const candles = d.candles.map(parseMarketCandle)
      if (candles.some((item, index) => index > 0 && item.at <= candles[index - 1]!.at)) throw new Error('unordered candle cache')
      if (d.synced_through !== undefined && (!Number.isSafeInteger(d.synced_through) || !candles.some(item => item.at === d.synced_through))) throw new Error('invalid candle sync cursor')
      return { case_id: d.case_id, business_date: d.business_date, candles,
        interval_ms: parseMarketCandleInterval(d.interval_ms ?? MARKET_LEGACY_CANDLE_INTERVAL_MS), complete: d.complete === true,
        ...(d.synced_through === undefined ? {} : { synced_through: d.synced_through as number }) }
    })
    const receipts = parseMarketHistoryResponse({ schema_version: 1, receipts: c.receipts, next_cursor: null }).receipts
    const pending = readMarketPending(storage, scope)
    return boundedMarketCache({ version: 1, scope, candles, receipts, pending })
  } catch { return empty() }
}

export function writeMarketCache(storage: MarketStorage | null, cache: MarketCache): void {
  if (!storage || !cache.scope) return
  try { storage.setItem(MARKET_CACHE_KEY, JSON.stringify(boundedMarketCache({ ...cache, pending: null }))) } catch { /* Cache loss cannot affect funds. */ }
}

/** Small durable intent is written independently of the expendable chart cache. */
export function writeMarketPending(storage: MarketStorage | null, scope: string, intent: MarketPositionRequest | null): boolean {
  if (!storage || !scope) return false
  try {
    if (intent === null) storage.removeItem(MARKET_PENDING_KEY)
    else storage.setItem(MARKET_PENDING_KEY, JSON.stringify({ version: 1, scope, intent }))
    return true
  } catch { return false }
}

function readMarketPending(storage: MarketStorage | null, scope: string): MarketPositionRequest | null {
  try {
    const raw = storage?.getItem(MARKET_PENDING_KEY)
    if (!raw || raw.length > 2048) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const data = value as Record<string, unknown>
    return data.version === 1 && data.scope === scope ? parseMarketPositionRequest(data.intent) : null
  } catch { return null }
}

export function readMarketAnimation(storage: MarketStorage | null, reducedMotion: boolean): boolean {
  try { const value = storage?.getItem(MARKET_ANIMATION_KEY); return value === 'dynamic' ? true : value === 'static' ? false : !reducedMotion }
  catch { return !reducedMotion }
}

export function writeMarketAnimation(storage: MarketStorage | null, animated: boolean): void {
  try { storage?.setItem(MARKET_ANIMATION_KEY, animated ? 'dynamic' : 'static') } catch { /* Cosmetic only. */ }
}
