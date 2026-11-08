import type { UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'
import type { LiangxiangWireState, WireVoteRequest } from '../shared/wire.ts'
import type { LiangHostService, VoteOutcome } from './service.ts'
import type { V1HistoryResponse } from '../shared/history-v1.ts'
import type { MarketCandlesResponse, MarketHistoryResponse, MarketPositionRequest, MarketPositionResponse, MarketState } from '../shared/market-v1.ts'
import type { MarketCandlesQuery, MarketHistoryQuery } from './market-query.ts'
import { BackendClientError } from './backend-client.ts'

/**
 * Swappable host authority. Online is the default. Only an explicit saved
 * user/config choice may switch this slot; a failed health probe must not.
 */
export class AuthoritySlot implements LiangHostService {
  private inner: LiangHostService
  private readonly listeners = new Set<() => void>()
  private unsub: (() => void) | null = null
  creditSimulatedUsage?: (deltaEffectiveTokens: number) => void
  cycleLocalCase?: () => void

  constructor(inner: LiangHostService) {
    this.inner = inner
    this.bind(inner)
  }

  get current(): LiangHostService {
    return this.inner
  }

  /**
   * Swap the inner service.
   * @param next - the service to serve next.
   * @param disposePrevious - dispose the outgoing service after the swap. Pass
   *   `false` when the caller owns the outgoing service lifecycle during an
   *   explicit transition.
   */
  use(next: LiangHostService, disposePrevious = true): void {
    if (next === this.inner) return
    const previous = this.inner
    this.bind(next)
    if (disposePrevious) previous.dispose?.()
    this.emit()
  }

  get isReady(): boolean {
    return this.inner.isReady
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getWireState(): LiangxiangWireState {
    return this.inner.getWireState()
  }

  history(afterVersion?: number): V1HistoryResponse | Promise<V1HistoryResponse> {
    return this.inner.history(afterVersion)
  }

  market(): Promise<MarketState> {
    if (this.inner.market === undefined) return Promise.reject(new BackendClientError('community market is unavailable in this mode', 404, 'market_unavailable'))
    return this.inner.market()
  }

  marketPosition(intent: MarketPositionRequest): Promise<MarketPositionResponse> {
    if (this.inner.marketPosition === undefined) return Promise.reject(new BackendClientError('community market is unavailable in this mode', 404, 'market_unavailable'))
    return this.inner.marketPosition(intent)
  }

  marketCandles(query?: MarketCandlesQuery): Promise<MarketCandlesResponse> {
    if (this.inner.marketCandles === undefined) return Promise.reject(new BackendClientError('community market is unavailable in this mode', 404, 'market_unavailable'))
    return this.inner.marketCandles(query)
  }

  marketHistory(query?: MarketHistoryQuery): Promise<MarketHistoryResponse> {
    if (this.inner.marketHistory === undefined) return Promise.reject(new BackendClientError('community market is unavailable in this mode', 404, 'market_unavailable'))
    return this.inner.marketHistory(query)
  }

  cachedMarketState(): MarketState | null { return this.inner.cachedMarketState?.() ?? null }
  marketCacheScope(): string | null { return this.inner.marketCacheScope?.() ?? null }

  vote(intent: WireVoteRequest): VoteOutcome | Promise<VoteOutcome> {
    return this.inner.vote(intent)
  }

  observeUsage(
    sessionId: string,
    value: unknown,
    origin: UsageObservationOrigin,
    modelId?: string | null,
  ): void {
    this.inner.observeUsage(sessionId, value, origin, modelId)
  }

  setAccountingAvailable(available: boolean): void {
    this.inner.setAccountingAvailable(available)
  }

  markReadyMemoryOnly(reason: string): void {
    this.inner.markReadyMemoryOnly(reason)
  }

  tick(): void {
    this.inner.tick()
  }

  refreshNow(): void | Promise<void> {
    return this.inner.refreshNow?.()
  }

  reconcileNow(): void | Promise<void> {
    return this.inner.reconcileNow?.()
  }

  dispose(): void {
    this.unsub?.()
    this.unsub = null
    this.inner.dispose?.()
  }

  private bind(inner: LiangHostService): void {
    this.unsub?.()
    this.inner = inner
    this.unsub = inner.subscribe(() => this.emit())
    const credit = inner.creditSimulatedUsage
    if (credit === undefined) delete this.creditSimulatedUsage
    else this.creditSimulatedUsage = (delta) => credit.call(inner, delta)
    const cycle = inner.cycleLocalCase
    if (cycle === undefined) delete this.cycleLocalCase
    else this.cycleLocalCase = () => cycle.call(inner)
  }

  protected emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* a bad subscriber must not break the others */
      }
    }
  }
}
