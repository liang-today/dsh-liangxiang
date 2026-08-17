import type { UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'
import type { LiangbiaoWireState, WireVoteRequest } from '../shared/wire.ts'
import type { LiangHostService, VoteOutcome } from './service.ts'
import type { V1HistoryResponse } from '../shared/history-v1.ts'

/**
 * Swappable host authority. Online is the default; a failed health probe
 * replaces the inner service with the in-process fake so the panel can
 * honestly say 今日梁案（本地） instead of hanging on a dead backend.
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
   *   `false` to keep it alive (e.g. keep the online service around so a
   *   network re-check can switch back to it).
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

  getWireState(): LiangbiaoWireState {
    return this.inner.getWireState()
  }

  history(afterVersion?: number): V1HistoryResponse | Promise<V1HistoryResponse> {
    return this.inner.history(afterVersion)
  }

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

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* a bad subscriber must not break the others */
      }
    }
  }
}
