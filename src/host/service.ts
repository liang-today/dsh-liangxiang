/**
 * The seam `/liangbiao/api/*` is written against, so the host half can serve
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
import type { LiangbiaoWireState, WireVoteRequest } from '../shared/wire.ts'

export interface VoteOutcome {
  result: VoteResult
  state: LiangbiaoWireState
}

export interface LiangHostService {
  /** False until the service can answer authoritatively (routes serve 503). */
  readonly isReady: boolean
  subscribe: (listener: () => void) => () => void
  getWireState: () => LiangbiaoWireState
  vote: (intent: WireVoteRequest) => VoteOutcome | Promise<VoteOutcome>
  /** Feed one cumulative DSH `tokenUsage` projection value. */
  observeUsage: (sessionId: string, value: unknown, origin: UsageObservationOrigin) => void
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
  /** Release timers, in-flight requests and subscriptions. */
  dispose?: () => void
}
