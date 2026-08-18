/**
 * The seam `/liangxiang/api/*` is written against, so the host half can serve
 * either authority mode without the routes (or the browser wire) changing:
 *
 *   LOCAL_FAKE_DEV      `FakeAuthoritativeLiangService` — everything in-process
 *   DEV_STAGING_ONLY    `BackendLiangService` — the online backend is authority
 *
 * Both report the mode inside the wire frame, so the client can never mistake
 * one for the other.
 */
import type { VoteResult } from '../domain/index.ts'
import type { UsageObservationOrigin } from '../compat/dsh/usage-observer.ts'
import type { LiangxiangWireState, WireVoteRequest } from '../shared/wire.ts'
import type { V1HistoryResponse } from '../shared/history-v1.ts'

export interface VoteOutcome {
  result: VoteResult
  state: LiangxiangWireState
}

export interface LiangHostService {
  /** False only before the selected authority can emit a wire frame. */
  readonly isReady: boolean
  subscribe: (listener: () => void) => () => void
  getWireState: () => LiangxiangWireState
  /** Separate cold archive channel; never embedded into the hot SSE frame. */
  history: (afterVersion?: number) => V1HistoryResponse | Promise<V1HistoryResponse>
  vote: (intent: WireVoteRequest) => VoteOutcome | Promise<VoteOutcome>
  /** Feed one cumulative DSH `tokenUsage` projection value (optional route model id). */
  observeUsage: (
    sessionId: string,
    value: unknown,
    origin: UsageObservationOrigin,
    modelId?: string | null,
  ) => void
  setAccountingAvailable: (available: boolean) => void
  /** Bounded startup fallback when no storage domain attaches. */
  markReadyMemoryOnly: (reason: string) => void
  /** Cadence hook (snapshot publication / refresh). */
  tick: () => void
  /**
   * Force a backend re-read now (hover / panel open). Online: re-bootstrap so
   * the expanded panel does not wait for the next 1s snapshot poll. Local:
   * rotate to the current business date. Optional so older fakes stay valid.
   */
  refreshNow?: () => void | Promise<void>
  /**
   * Drop local Token observation (keep identity + watermarks) and re-read the
   * authoritative incense ledger. Online: overlay the server remaining.
   * Local fake: date rotate only — this process IS the ledger.
   */
  reconcileNow?: () => void | Promise<void>
  /**
   * LOCAL_FAKE_DEV only: fold Pro-equivalent tokens into today's ledger
   * without a DSH session. Online hosts must omit this so a curl cannot
   * mint a claim against the shared backend.
   */
  creditSimulatedUsage?: (deltaEffectiveTokens: number) => void
  /**
   * LOCAL_FAKE_DEV only: rotate among the prepared 今日梁案 list.
   * Online hosts omit this — community cases are published on the VPS CLI.
   */
  cycleLocalCase?: () => void
  /** Release timers, in-flight requests and subscriptions. */
  dispose?: () => void
}
