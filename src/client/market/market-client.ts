import {
  parseMarketState, parseMarketCandlesResponse, parseMarketHistoryResponse, parseMarketPositionResponse,
  MARKET_CANDLES_DAY_MAX, MARKET_CANDLES_PAGE_MAX, MARKET_LEGACY_CANDLE_INTERVAL_MS,
  type MarketState, type MarketCandle, type MarketCandleIntervalMs, type MarketReceipt, type MarketPositionRequest,
} from '../../shared/market-v1.ts'
import { boundedMarketCache, browserMarketStorage, emptyMarketCache, readMarketCache, writeMarketCache, writeMarketPending, type MarketCache, type MarketStorage } from './market-cache.ts'
import { randomRequestId } from '../request-id.ts'
import { browserEvents, createBrowserRequests, HOST_API } from '../browser-request.ts'

const BASE = `${HOST_API}/market`
export interface MarketResponse { body: unknown, scope: string }
export interface MarketTransport {
  request(path: string, body?: MarketPositionRequest): Promise<MarketResponse>
  events(onState: (body: unknown, scope: string) => void, onError: () => void): { close(): void }
  requestId(): string
  dispose(): void
}
export interface MarketView {
  state: MarketState | null
  status: 'loading' | 'live' | 'offline' | 'unsupported'
  candles: MarketCandle[]
  candleIntervalMs?: MarketCandleIntervalMs
  receipts: MarketReceipt[]
  historyPage: number
  nextCursor: string | null
  pending: MarketPositionRequest | null
  sending: boolean
  historyLoading: boolean
  error: string | null
  chartError: string | null
  scope: string
}
export interface MarketSession {
  getSnapshot(): MarketView
  subscribe(listener: () => void): () => void
  start(): Promise<void>
  submit(intent: Omit<MarketPositionRequest, 'request_id'>, onAccepted?: (state: MarketState) => void): Promise<void>
  retryPending(): Promise<void>
  loadHistory(more?: boolean | 'newer'): Promise<void>
  dispose(): void
}

class MarketHttpError extends Error {
  constructor(readonly status: number) { super(status === 404 ? '当前连接尚未开放香火市场，凝香、上香与梁祠仍可使用。' : status === 409 ? '仓位状态已变化，正在重新核对。' : '暂时无法连接社区，正在自动重连。') }
}

/** Boundary failures already map to the specific user notices below. */
function invalidMarketData(): never { throw new Error('invalid market data') }

export function browserMarketTransport(): MarketTransport {
  const requests = createBrowserRequests()
  return {
    async request(path, body) {
      const [payload, headers] = await requests.json(`${BASE}${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined, response => {
        if (!response.ok && response.status !== 409) throw new MarketHttpError(response.status)
      })
      return { body: payload, scope: headers.get('x-liangxiang-cache-scope') ?? '' }
    },
    events(onState, onError) {
      return browserEvents(`${BASE}/events`, data => {
        try {
          const body: unknown = JSON.parse(data)
          const scope = body && typeof body === 'object' && 'cache_scope' in body && typeof body.cache_scope === 'string' ? body.cache_scope : ''
          onState(body, scope)
        } catch { onError() }
      }, onError)
    },
    requestId: () => randomRequestId(),
    dispose: requests.dispose,
  }
}

export function createMarketSession(transport: MarketTransport = browserMarketTransport(), storage: MarketStorage | null = browserMarketStorage()): MarketSession {
  let view: MarketView = { state: null, status: 'loading', candles: [], candleIntervalMs: MARKET_LEGACY_CANDLE_INTERVAL_MS, receipts: [], historyPage: 1, nextCursor: null, pending: null, sending: false, historyLoading: false, error: null, chartError: null, scope: '' }
  let cache: MarketCache = emptyMarketCache('')
  let disposed = false, source: { close(): void } | null = null, chartKey = '', chartLoading = false, chartQueued = false, lastCacheSave = 0
  let historyCursors: Array<string | undefined> = [undefined], historyIndex = 0, historyGeneration = 0
  let acceptedFeedback: { id: string, play(state: MarketState): void } | null = null
  let connecting: Promise<void> | null = null, generation = 0, retryDelay = 1_000
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let chartRetry: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<() => void>()
  const update = (patch: Partial<MarketView>): void => {
    if (disposed) return
    view = { ...view, ...patch }
    for (const listener of listeners) listener()
  }
  const stopRetry = (): void => { clearTimeout(retryTimer ?? undefined); retryTimer = null }
  const stopChartRetry = (): void => { clearTimeout(chartRetry ?? undefined); chartRetry = null }
  const disconnect = (error: unknown, expected: number): void => {
    if (expected !== generation) return
    stopRetry()
    generation++
    source?.close(); source = null
    const unsupported = error instanceof MarketHttpError && [404, 405, 501].includes(error.status)
    update({ status: unsupported ? 'unsupported' : 'offline', error: error instanceof MarketHttpError ? error.message : '网络暂时不稳，正在自动重连；香火与仓位已保留。' })
    if (!unsupported) {
      retryTimer = setTimeout(() => { void session.start() }, retryDelay)
      retryDelay = Math.min(30_000, retryDelay * 2)
    }
  }
  const save = (immediate = true): void => {
    if (!immediate && Date.now() - lastCacheSave < 15_000) return
    cache = boundedMarketCache(cache)
    writeMarketCache(storage, cache); lastCacheSave = Date.now()
  }
  const withCandle = (candles: MarketCandle[], candle: MarketCandle): MarketCandle[] => {
    const old = candles.find(c => c.at === candle.at)
    if (old && (old.volume > candle.volume || old.up_votes + old.down_votes > candle.up_votes + candle.down_votes)) return candles
    return [...candles.filter(c => c.at !== candle.at), candle].sort((a, b) => a.at - b.at).slice(-MARKET_CANDLES_DAY_MAX)
  }
  const adoptScope = (scope: string): void => {
    if (!scope || scope === view.scope) return
    stopChartRetry()
    acceptedFeedback = null
    cache = readMarketCache(storage, scope)
    historyCursors = [undefined]; historyIndex = 0; historyGeneration++
    update({ scope, receipts: cache.receipts, pending: cache.pending, candles: [], candleIntervalMs: MARKET_LEGACY_CANDLE_INTERVAL_MS, nextCursor: null, historyPage: 1, historyLoading: false })
    chartKey = ''
  }
  const loadCandles = async (): Promise<void> => {
    const market = view.state?.market
    if (!market) return
    if (chartLoading) { chartQueued = true; return }
    stopChartRetry()
    chartLoading = true
    const scope = view.scope
    const current = (): boolean => !disposed && view.scope === scope && view.state?.market?.id === market.id
    try {
      const cached = cache.candles.find(day => day.case_id === market.case_id)
      const oldInterval = view.candleIntervalMs ?? MARKET_LEGACY_CANDLE_INTERVAL_MS
      let base = cached?.complete && (cached.interval_ms ?? MARKET_LEGACY_CANDLE_INTERVAL_MS) === oldInterval ? cached.candles : []
      // Only a complete HTTP traversal advances this cursor. Later SSE points
      // may skip buckets during reconnect and must not move the repair window.
      const confirmed = cached?.synced_through === undefined ? [] : base.filter(c => c.at <= cached.synced_through!)
      let cursor = confirmed.length > 2 ? String(confirmed[confirmed.length - 3]!.at) : undefined
      let rows: MarketCandle[] = [], interval: MarketCandleIntervalMs = oldInterval
      const seen = new Set<string>()
      let completed = false
      for (let page = 0; page < Math.ceil(MARKET_CANDLES_DAY_MAX / MARKET_CANDLES_PAGE_MAX) + 1; page += 1) {
        const query = new URLSearchParams({ business_date: market.business_date, case_id: market.case_id, limit: String(MARKET_CANDLES_PAGE_MAX) })
        if (cursor !== undefined) query.set('cursor', cursor)
        const response = await transport.request(`/candles?${query}`)
        const data = parseMarketCandlesResponse(response.body)
        if (!current()) return
        if (response.scope && response.scope !== scope) invalidMarketData()
        if (data.case_id !== market.case_id || data.business_date !== market.business_date) invalidMarketData()
        if (base.length > 0 && data.interval_ms !== oldInterval) {
          base = []; rows = []; cursor = undefined; seen.clear(); continue
        }
        if (rows.length > 0 && interval !== data.interval_ms) invalidMarketData()
        interval = data.interval_ms
        if (rows.length > 0 && data.candles.length > 0 && data.candles[0]!.at <= rows.at(-1)!.at) invalidMarketData()
        rows.push(...data.candles)
        if (rows.length > MARKET_CANDLES_DAY_MAX) invalidMarketData()
        if (data.next_cursor === null) { completed = true; break }
        if (seen.has(data.next_cursor) || data.candles.length === 0) invalidMarketData()
        seen.add(data.next_cursor); cursor = data.next_cursor
      }
      if (!completed || !current()) invalidMarketData()
      const merged = new Map(base.map(c => [c.at, c]))
      const merge = (candle: MarketCandle): void => {
        const old = merged.get(candle.at)
        if (!old || (old.volume <= candle.volume && old.up_votes + old.down_votes <= candle.up_votes + candle.down_votes)) merged.set(candle.at, candle)
      }
      for (const row of rows) merge(row)
      if ((view.candleIntervalMs ?? MARKET_LEGACY_CANDLE_INTERVAL_MS) === interval) for (const observed of view.candles) merge(observed)
      const live = view.state?.current_candle
      if (live && (view.state?.candle_interval_ms ?? MARKET_LEGACY_CANDLE_INTERVAL_MS) === interval) merge(live)
      const candles = [...merged.values()].sort((a, b) => a.at - b.at).slice(-MARKET_CANDLES_DAY_MAX)
      const syncedThrough = rows.at(-1)?.at ?? (base.length > 0 ? cached?.synced_through : undefined)
      cache.candles = [{ case_id: market.case_id, business_date: market.business_date, interval_ms: interval, complete: true,
        ...(syncedThrough === undefined ? {} : { synced_through: syncedThrough }), candles }, ...cache.candles.filter(day => day.case_id !== market.case_id)]
      save()
      update({ candles, candleIntervalMs: interval, chartError: null })
    } catch {
      if (current()) {
        update({ chartError: '行情暂未更新，官方参考点仍有效。' })
        chartRetry = setTimeout(() => { chartRetry = null; void loadCandles() }, 5_000)
      }
    }
    finally { chartLoading = false; if (chartQueued && !disposed) { chartQueued = false; void loadCandles() } }
  }
  const adopt = (state: MarketState, scope: string): void => {
    if (disposed) return
    const identityChanged = scope !== '' && view.scope !== '' && scope !== view.scope
    // Wallet versions order confirmed personal transactions; Host clock
    // projection is not a receipt revision and can run ahead of the backend.
    // A valid current connection still recovers when its payload is older:
    // retain the confirmed state while restoring transport status and notice.
    if (!identityChanged && view.state && (state.wallet.version < view.state.wallet.version
      || (state.wallet.version === view.state.wallet.version && state.server_time < view.state.server_time))) state = view.state
    adoptScope(scope)
    const old = view.state
    const market = state.market
    if (old?.market?.id !== market?.id) stopChartRetry()
    const interval = state.candle_interval_ms ?? MARKET_LEGACY_CANDLE_INTERVAL_MS
    let candles = old?.market?.case_id !== market?.case_id || (view.candleIntervalMs ?? MARKET_LEGACY_CANDLE_INTERVAL_MS) !== interval ? [] : view.candles
    const cachedDay = market === null ? undefined : cache.candles.find(day => day.case_id === market.case_id)
    if (candles.length === 0 && cachedDay && (cachedDay.interval_ms ?? MARKET_LEGACY_CANDLE_INTERVAL_MS) === interval) candles = cachedDay.candles
    if (state.current_candle) candles = withCandle(candles, state.current_candle)
    update({ state, candles, candleIntervalMs: interval, status: 'live', error: view.pending ? '存在一笔未确认仓位，请核对原请求后再调整。' : null })
    if (market) {
      if (state.current_candle) {
        const prior = cache.candles.find(day => day.case_id === market.case_id)
        const sameInterval = (prior?.interval_ms ?? MARKET_LEGACY_CANDLE_INTERVAL_MS) === interval
        cache.candles = [{ case_id: market.case_id, business_date: market.business_date, candles, interval_ms: interval,
          complete: prior?.complete === true && sameInterval,
          ...(sameInterval && prior?.synced_through !== undefined ? { synced_through: prior.synced_through } : {}) }, ...cache.candles.filter(day => day.case_id !== market.case_id)]
        save(false)
      }
      const key = `${market.id}:${interval}:${Math.floor(state.server_time / MARKET_LEGACY_CANDLE_INTERVAL_MS)}:${market.status}`
      if (chartKey !== key) {
        chartKey = key
        void loadCandles()
      }
      if (identityChanged || (old?.market && (old.market.id !== market.id || (old.market.status === 'open' && market.status !== 'open')))) void session.loadHistory()
    }
  }
  const send = async (intent: MarketPositionRequest): Promise<void> => {
    if (disposed || view.sending) return
    if (!writeMarketPending(storage, view.scope, intent)) {
      update({ error: '浏览器暂时无法保存待确认请求，请允许本地存储后再调整仓位。' })
      return
    }
    update({ pending: intent, sending: true, error: null })
    cache.pending = intent
    const scope = view.scope, marketId = view.state?.market?.id
    const current = (): boolean => !disposed && view.scope === scope && view.pending?.request_id === intent.request_id
      && view.state?.market?.id === marketId
    try {
      const response = await transport.request('/position', intent)
      if (!current()) return
      if (response.scope && response.scope !== scope) invalidMarketData()
      const result = parseMarketPositionResponse(response.body)
      if (result.request_id !== intent.request_id) invalidMarketData()
      adopt(result.state, response.scope)
      cache.pending = null; writeMarketPending(storage, scope, null)
      update({ pending: null, error: result.accepted ? null : rejectionCopy(result.reason) })
      const feedback = acceptedFeedback
      acceptedFeedback = null
      if (result.accepted && feedback?.id === intent.request_id) {
        try { feedback.play(result.state) } catch { /* Sound never changes a receipt. */ }
      }
    } catch (error) {
      if (current()) {
        disconnect(error, generation)
        update({ error: error instanceof MarketHttpError ? error.message : '这笔仓位尚未确认，请核对原请求；不会重新生成订单。' })
      }
    } finally { update({ sending: false }) }
  }
  const session: MarketSession = {
    getSnapshot: () => view,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    start() {
      if (disposed || connecting) return connecting ?? Promise.resolve()
      stopRetry()
      source?.close(); source = null
      const expected = ++generation, current = (): boolean => expected === generation
      const failed = (): void => disconnect(null, expected)
      return connecting = transport.request('').then(response => {
          if (!current()) return
          adopt(parseMarketState(response.body), response.scope)
          const next = transport.events((body, scope) => {
            if (!current()) return
            try { adopt(parseMarketState(body), scope); retryDelay = 1_000 }
            catch { failed() }
          }, failed)
          if (current()) source = next; else next.close()
        }).catch(error => disconnect(error, expected))
        .finally(() => { connecting = null })
        .then(() => { if (current()) return session.loadHistory() })
    },
    async submit(intent, onAccepted) {
      if (view.pending || view.sending) throw new Error('请先核对上一笔未确认的仓位')
      if (view.status !== 'live') throw new Error('连接恢复后才能调整仓位')
      const request = { ...intent, request_id: transport.requestId() }
      acceptedFeedback = onAccepted ? { id: request.request_id, play: onAccepted } : null
      await send(request)
    },
    async retryPending() { if (view.pending) await send(view.pending) },
    async loadHistory(more = false) {
      if (disposed || view.historyLoading || (more === true && !view.nextCursor) || (more === 'newer' && historyIndex === 0)) return
      const scope = view.scope, generation = historyGeneration
      const current = (): boolean => !disposed && view.scope === scope && historyGeneration === generation
      const index = more === true ? historyIndex + 1 : more === 'newer' ? historyIndex - 1 : 0
      const cursor = more === true ? view.nextCursor! : more === 'newer' ? historyCursors[index] : undefined
      update({ historyLoading: true })
      try {
        const query = new URLSearchParams({ limit: '20' })
        if (cursor !== undefined) query.set('cursor', cursor)
        const response = await transport.request(`/history?${query}`)
        if (!current()) return
        if (response.scope && response.scope !== scope) invalidMarketData()
        const page = parseMarketHistoryResponse(response.body)
        if (page.next_cursor !== null && (page.receipts.length === 0 || page.next_cursor === cursor)) invalidMarketData()
        // Retain only this page; the cursor trail lets older history stay on the server.
        historyCursors[index] = cursor; historyCursors.length = index + 1; historyIndex = index
        cache.receipts = [...page.receipts, ...cache.receipts]; save()
        update({ receipts: page.receipts, nextCursor: page.next_cursor, historyPage: index + 1 })
      } catch { if (current()) update({ error: '历史回执暂未更新，已确认的钱包不受影响。' }) }
      finally { if (current()) update({ historyLoading: false }) }
    },
    dispose() { save(); disposed = true; generation++; stopRetry(); stopChartRetry(); acceptedFeedback = null; source?.close(); transport.dispose(); listeners.clear() },
  }
  return session
}

function rejectionCopy(reason: string | null): string {
  if (reason?.includes('balance') || reason?.includes('incense')) return '可用香火不足，冻结资金不能重复投入。'
  if (reason?.includes('lock') || reason?.includes('closed')) return '本盘已封盘，原仓位保持不变。'
  return '本次调整未成交，请以当前服务器仓位为准。'
}
