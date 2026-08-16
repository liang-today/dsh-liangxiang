/**
 * Live host-backed store: bootstrap over GET /state, push over SSE, votes
 * over POST /vote with client-generated idempotent request IDs.
 *
 * Failure posture:
 *  - every fetch is timeout-bounded and abortable;
 *  - one vote retry reuses the SAME requestId (never a fresh id to escape an
 *    uncertain outcome);
 *  - SSE errors are counted; after a bounded number the stream closes and
 *    the store goes `offline` (the UI keeps rendering the last known state);
 *  - `refresh()` reconnects when offline; while live it POSTs `/refresh` so
 *    hover / panel-open can force a host re-bootstrap instead of waiting for
 *    the next 1s snapshot poll. No extra background poll loop.
 */
import { derivePersonalLiangQiState, type VoteResult, type VoteType } from '../domain/index.ts'
import { parseWireState, parseWireVoteResponse } from '../shared/wire.ts'
import {
  createOfflineViewState,
  wireToViewState,
  type LiangbiaoStore,
  type LiangbiaoViewState,
} from './store.ts'

const STATE_PATH = '/liangbiao/api/state'
const EVENTS_PATH = '/liangbiao/api/events'
const VOTE_PATH = '/liangbiao/api/vote'
const REFRESH_PATH = '/liangbiao/api/refresh'
const RECONCILE_PATH = '/liangbiao/api/reconcile'
const FETCH_TIMEOUT_MS = 6_000
const VOTE_RETRY_DELAY_MS = 400
const MAX_SSE_ERRORS = 5
/** Hover may fire often; skip if a live refresh ran this recently. */
const MIN_LIVE_REFRESH_MS = 2_000

/** Injectable transport (real fetch/EventSource in the browser, fakes in tests). */
export interface LiveStoreTransport {
  fetchJson(path: string, init?: { method?: string, body?: string }): Promise<unknown>
  openEvents(path: string, handlers: { onFrame(data: string): void, onError(): void }): { close(): void }
  randomRequestId(): string
}

function createBrowserTransport(): LiveStoreTransport {
  return {
    async fetchJson(path, init) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const request: RequestInit = { method: init?.method ?? 'GET', signal: controller.signal }
        if (init?.body !== undefined) {
          request.headers = { 'content-type': 'application/json' }
          request.body = init.body
        }
        const response = await fetch(path, request)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${path}`)
        }
        return (await response.json()) as unknown
      } finally {
        clearTimeout(timeout)
      }
    },
    openEvents(path, handlers) {
      const source = new EventSource(path)
      source.onmessage = (event) => handlers.onFrame(String(event.data))
      source.onerror = () => handlers.onError()
      return { close: () => source.close() }
    },
    randomRequestId: () => crypto.randomUUID(),
  }
}

export interface LiveLiangbiaoStore extends LiangbiaoStore {
  /** Bootstrap + open the push stream (idempotent). */
  start(): void
  /**
   * Offline: reconnect. Live: ask the host to re-read the backend now.
   * `force` skips the hover throttle (panel open).
   */
  refresh(options?: { force?: boolean }): void
  /** Drop local Token observation and re-read the server incense ledger. */
  reconcile(): Promise<void>
  /**
   * Frontend-only UI probe: move ring fill / 下一炷 on this tab's picture.
   * Does not call the Host or the backend and does not add spendable incense.
   * 上达天听 clears it.
   */
  creditDev(intent?: { sticks?: number, effectiveTokens?: number }): Promise<void>
  /** Abort in-flight work and close the stream. */
  dispose(): void
}

export function createLiveLiangbiaoStore(
  transport: LiveStoreTransport = createBrowserTransport(),
): LiveLiangbiaoStore {
  let state: LiangbiaoViewState = createOfflineViewState('connecting')
  let lastRevision = -1
  let lastHostEpoch = -1
  let lastWire: LiangbiaoViewState | null = null
  let demoExtraTokens = 0
  let stream: { close(): void } | null = null
  let sseErrors = 0
  let disposed = false
  let starting = false
  let refreshInFlight = false
  let reconcileInFlight = false
  let lastLiveRefreshAt = 0
  const listeners = new Set<() => void>()

  const withDemoOverlay = (view: LiangbiaoViewState): LiangbiaoViewState => {
    if (demoExtraTokens <= 0) return view
    const painted = derivePersonalLiangQiState({
      effectiveTokensToday: view.personal.effectiveTokensToday + demoExtraTokens,
      usedIncenseToday: view.personal.usedIncenseToday,
      tokenPerIncense: view.personal.tokenPerIncense,
    })
    // Ring fill / 下一炷 may move; spendable remaining stays on the
    // authoritative ledger so the vote buttons cannot light up on a
    // frontend-only overlay the backend will reject.
    return {
      ...view,
      personal: {
        ...painted,
        remainingIncense: view.personal.remainingIncense,
        earnedIncenseToday: view.personal.earnedIncenseToday,
      },
    }
  }

  const publishWire = (view: LiangbiaoViewState): void => {
    lastWire = view
    setState(withDemoOverlay(view))
  }

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const setState = (next: LiangbiaoViewState): void => {
    state = next
    notify()
  }

  const applyWire = (raw: unknown): void => {
    const wire = parseWireState(raw)
    if (wire.hostEpoch !== lastHostEpoch) {
      lastHostEpoch = wire.hostEpoch
      lastRevision = -1
    }
    if (wire.revision > lastRevision) {
      lastRevision = wire.revision
      publishWire(wireToViewState(wire, 'live'))
    } else if (state.connection !== 'live') {
      // Reconnect delivering an already-known revision: only flip the
      // connection flag; never rewind to a stale frame.
      const base = lastWire ?? state
      publishWire({ ...base, connection: 'live' })
    }
  }

  const goOffline = (): void => {
    if (stream !== null) {
      stream.close()
      stream = null
    }
    if (state.connection !== 'offline') {
      setState({ ...state, connection: 'offline' })
    }
  }

  const openStream = (): void => {
    if (disposed || stream !== null) return
    sseErrors = 0
    stream = transport.openEvents(EVENTS_PATH, {
      onFrame: (data) => {
        try {
          applyWire(JSON.parse(data) as unknown)
          sseErrors = 0
        } catch (error) {
          console.warn(`[dsh-liangbiao] dropping malformed SSE frame: ${error instanceof Error ? error.message : String(error)}`)
        }
      },
      onError: () => {
        sseErrors += 1
        if (sseErrors >= MAX_SSE_ERRORS) goOffline()
      },
    })
  }

  const bootstrap = (): void => {
    if (disposed || starting) return
    starting = true
    transport.fetchJson(STATE_PATH)
      .then((raw) => {
        starting = false
        if (disposed) return
        applyWire(raw)
        openStream()
      })
      .catch((error: unknown) => {
        starting = false
        console.warn(`[dsh-liangbiao] state bootstrap failed: ${error instanceof Error ? error.message : String(error)}`)
        goOffline()
      })
  }

  const pullLatest = (force: boolean): void => {
    if (disposed || refreshInFlight || starting) return
    const now = Date.now()
    if (!force && now - lastLiveRefreshAt < MIN_LIVE_REFRESH_MS) return
    refreshInFlight = true
    lastLiveRefreshAt = now
    transport.fetchJson(REFRESH_PATH, { method: 'POST' })
      .then((raw) => {
        if (!disposed) applyWire(raw)
      })
      .catch((error: unknown) => {
        console.warn(`[dsh-liangbiao] live refresh failed: ${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        refreshInFlight = false
      })
  }

  const postVote = async (voteType: VoteType, requestId: string): Promise<VoteResult> => {
    const body = JSON.stringify({ caseId: state.activeCase.id, voteType, requestId })
    const attempt = (): Promise<unknown> => transport.fetchJson(VOTE_PATH, { method: 'POST', body })
    let raw: unknown
    try {
      raw = await attempt()
    } catch {
      // One bounded retry with the SAME requestId — idempotency, not a new intent.
      await new Promise((resolve) => setTimeout(resolve, VOTE_RETRY_DELAY_MS))
      raw = await attempt()
    }
    const response = parseWireVoteResponse(raw)
    applyWire(response.state)
    return response.result
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    vote: (voteType) => postVote(voteType, transport.randomRequestId()),
    start: () => bootstrap(),
    refresh: (options) => {
      if (disposed) return
      if (state.connection === 'offline') {
        if (!starting) bootstrap()
        return
      }
      pullLatest(options?.force === true)
    },
    reconcile: () => {
      if (disposed || reconcileInFlight || starting) return Promise.resolve()
      demoExtraTokens = 0
      if (lastWire !== null) publishWire(lastWire)
      if (state.connection === 'offline') {
        if (!starting) bootstrap()
        return Promise.resolve()
      }
      reconcileInFlight = true
      return transport.fetchJson(RECONCILE_PATH, { method: 'POST' })
        .then((raw) => {
          if (!disposed) applyWire(raw)
        })
        .catch((error: unknown) => {
          console.warn(`[dsh-liangbiao] reconcile failed: ${error instanceof Error ? error.message : String(error)}`)
          throw error
        })
        .finally(() => {
          reconcileInFlight = false
        })
    },
    creditDev: (intent = { sticks: 1 }) => {
      if (disposed) return Promise.resolve()
      const tokenPerIncense = state.personal.tokenPerIncense
      const add = intent.effectiveTokens ?? (intent.sticks ?? 1) * tokenPerIncense
      if (!Number.isInteger(add) || add <= 0) return Promise.resolve()
      demoExtraTokens += add
      const base = lastWire ?? state
      publishWire(base)
      return Promise.resolve()
    },
    dispose: () => {
      disposed = true
      if (stream !== null) {
        stream.close()
        stream = null
      }
      listeners.clear()
    },
  }
}
