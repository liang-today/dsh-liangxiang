/**
 * Live host-backed store: bootstrap over GET /state, push over SSE, votes
 * over POST /vote with client-generated idempotent request IDs.
 *
 * Failure posture:
 *  - every fetch is timeout-bounded and abortable;
 *  - one vote retry reuses the SAME requestId (never a fresh id to escape an
 *    uncertain outcome);
 *  - SSE errors are counted; after a bounded number the stream closes and
 *    the store goes `offline` (the UI keeps rendering the last known state),
 *    then reconnects automatically with bounded exponential backoff;
 *  - `refresh()` retries immediately when offline; while live it POSTs `/refresh` so
 *    hover / panel-open can force a host re-bootstrap instead of waiting for
 *    the next 1s snapshot poll. No extra background poll loop.
 */
import type { LiangHistoryArchive, VoteResult, VoteType } from '../domain/index.ts'
import { parseWireState, parseWireVoteResponse } from '../shared/wire.ts'
import { mergeHistoryArchive, parseV1HistoryResponse } from '../shared/history-v1.ts'
import { LOCAL_MODE_ACTION_HEADER, LOCAL_MODE_ACTION_VALUE } from '../shared/index.ts'
import {
  createOfflineViewState,
  wireToViewState,
  type LiangxiangStore,
  type LiangxiangViewState,
} from './store.ts'

const STATE_PATH = '/liangxiang/api/state'
const EVENTS_PATH = '/liangxiang/api/events'
const VOTE_PATH = '/liangxiang/api/vote'
const REFRESH_PATH = '/liangxiang/api/refresh'
const RECONCILE_PATH = '/liangxiang/api/reconcile'
const ENTER_LOCAL_PATH = '/liangxiang/api/local/enter'
const CYCLE_CASE_PATH = '/liangxiang/api/local/cycle-case'
const HISTORY_PATH = '/liangxiang/api/history'
const FETCH_TIMEOUT_MS = 6_000
const VOTE_RETRY_DELAY_MS = 400
const MAX_SSE_ERRORS = 5
const RECONNECT_INITIAL_MS = 1_000
const RECONNECT_MAX_MS = 30_000
/** Hover may fire often; skip if a live refresh ran this recently. */
const MIN_LIVE_REFRESH_MS = 2_000

/** Injectable transport (real fetch/EventSource in the browser, fakes in tests). */
export interface LiveStoreTransport {
  fetchJson(path: string, init?: { method?: string, body?: string, headers?: Record<string, string> }): Promise<unknown>
  openEvents(path: string, handlers: { onFrame(data: string): void, onError(): void }): { close(): void }
  randomRequestId(): string
}

export class LiveTransportError extends Error {
  constructor(readonly status: number, path: string) {
    super(`HTTP ${status} for ${path}`)
    this.name = 'LiveTransportError'
  }
}

function createBrowserTransport(): LiveStoreTransport {
  return {
    async fetchJson(path, init) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const headers: Record<string, string> = { ...init?.headers }
        const request: RequestInit = { method: init?.method ?? 'GET', headers, signal: controller.signal }
        if (init?.body !== undefined) {
          headers['content-type'] = 'application/json'
          request.body = init.body
        }
        const response = await fetch(path, request)
        if (!response.ok) {
          throw new LiveTransportError(response.status, path)
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

export interface LiveLiangxiangStore extends LiangxiangStore {
  /** Bootstrap + open the push stream (idempotent). */
  start(): void
  /**
   * Offline: reconnect. Live: ask the host to re-read the backend now.
   * `force` skips the hover throttle (panel open).
   */
  refresh(options?: { force?: boolean }): void
  /** Drop local Token observation and re-read the server incense ledger. */
  reconcile(): Promise<void>
  /** Abort in-flight work and close the stream. */
  dispose(): void
  /** Ask the Host to switch this process to LOCAL_FAKE_DEV. */
  chooseLocalMode(): void
  /** LOCAL_FAKE_DEV: ask the host to cycle the prepared 今日梁案 list. */
  cycleLocalCase(): void
  /** Independent cold-channel 梁祠 state. */
  getHistorySnapshot(): LiangciHistoryState
  subscribeHistory(listener: () => void): () => void
  /** Initial full fetch; later calls request only rows after the cached cursor. */
  loadHistory(): Promise<void>
}

export interface LiangciHistoryState {
  status: 'idle' | 'loading' | 'ready' | 'stale'
  archive: LiangHistoryArchive | null
  error: string | null
}

export function createLiveLiangxiangStore(
  transport: LiveStoreTransport = createBrowserTransport(),
): LiveLiangxiangStore {
  let state: LiangxiangViewState = createOfflineViewState('connecting')
  let lastRevision = -1
  let lastHostEpoch = -1
  let lastWire: LiangxiangViewState | null = null
  let stream: { close(): void } | null = null
  let sseErrors = 0
  let disposed = false
  let starting = false
  let refreshInFlight = false
  let reconcileInFlight = false
  let lastLiveRefreshAt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectBackoffMs = RECONNECT_INITIAL_MS
  const listeners = new Set<() => void>()
  let historyState: LiangciHistoryState = { status: 'idle', archive: null, error: null }
  let historyInFlight: Promise<void> | null = null
  const historyListeners = new Set<() => void>()

  const setHistoryState = (next: LiangciHistoryState): void => {
    historyState = next
    for (const listener of historyListeners) listener()
  }

  const loadHistory = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    if (historyInFlight !== null) return historyInFlight
    const cursor = historyState.archive?.archiveVersion
    const path = cursor === undefined ? HISTORY_PATH : `${HISTORY_PATH}?after_version=${cursor}`
    if (historyState.archive === null) setHistoryState({ status: 'loading', archive: null, error: null })
    const run = transport.fetchJson(path)
      .then((raw) => {
        if (disposed) return
        const incoming = parseV1HistoryResponse(raw)
        const archive = mergeHistoryArchive(historyState.archive, incoming)
        setHistoryState({
          status: archive.stale ? 'stale' : 'ready',
          archive,
          error: archive.stale ? '档案未更新' : null,
        })
      })
      .catch((error: unknown) => {
        if (disposed) return
        const message = error instanceof Error ? error.message : String(error)
        const archive = historyState.archive === null ? null : { ...historyState.archive, stale: true }
        setHistoryState({ status: 'stale', archive, error: `档案未更新：${message}` })
      })
      .finally(() => {
        historyInFlight = null
      })
    historyInFlight = run
    return run
  }

  const publishWire = (view: LiangxiangViewState): void => {
    lastWire = view
    setState(view)
    if (
      historyState.archive !== null
      && view.archiveVersion > historyState.archive.archiveVersion
    ) void loadHistory()
  }

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const setState = (next: LiangxiangViewState): void => {
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

  const clearReconnect = (): void => {
    if (reconnectTimer === null) return
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const scheduleReconnect = (): void => {
    if (disposed || reconnectTimer !== null || starting) return
    const delay = reconnectBackoffMs
    reconnectBackoffMs = Math.min(reconnectBackoffMs * 2, RECONNECT_MAX_MS)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      bootstrap()
    }, delay)
  }

  const goOffline = (): void => {
    if (stream !== null) {
      stream.close()
      stream = null
    }
    if (state.connection !== 'offline') {
      setState({ ...state, connection: 'offline' })
    }
    scheduleReconnect()
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
          console.warn(`[dsh-liangxiang] dropping malformed SSE frame: ${error instanceof Error ? error.message : String(error)}`)
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
        clearReconnect()
        reconnectBackoffMs = RECONNECT_INITIAL_MS
        applyWire(raw)
        openStream()
        // One full archive per Host connection; subsequent updates are deltas.
        void loadHistory()
      })
      .catch((error: unknown) => {
        starting = false
        console.warn(`[dsh-liangxiang] state bootstrap failed: ${error instanceof Error ? error.message : String(error)}`)
        goOffline()
      })
  }

  const enterLocalMode = (): void => {
    if (disposed || starting) return
    transport.fetchJson(ENTER_LOCAL_PATH, {
      method: 'POST',
      body: '{}',
      headers: { [LOCAL_MODE_ACTION_HEADER]: LOCAL_MODE_ACTION_VALUE },
    })
      .then((raw) => {
        if (!disposed) applyWire(raw)
      })
      .catch((error: unknown) => {
        console.warn(`[dsh-liangxiang] enter local mode failed: ${error instanceof Error ? error.message : String(error)}`)
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
        console.warn(`[dsh-liangxiang] live refresh failed: ${error instanceof Error ? error.message : String(error)}`)
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
    } catch (error) {
      if (error instanceof LiveTransportError && error.status >= 400 && error.status < 500) throw error
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
        clearReconnect()
        if (!starting) bootstrap()
        return
      }
      pullLatest(options?.force === true)
    },
    reconcile: () => {
      if (disposed || reconcileInFlight || starting) return Promise.resolve()
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
          console.warn(`[dsh-liangxiang] reconcile failed: ${error instanceof Error ? error.message : String(error)}`)
          throw error
        })
        .finally(() => {
          reconcileInFlight = false
        })
    },
    chooseLocalMode: () => {
      enterLocalMode()
    },
    cycleLocalCase: () => {
      if (disposed || starting) return
      if (state.authorityMode !== 'LOCAL_FAKE_DEV') return
      transport.fetchJson(CYCLE_CASE_PATH, { method: 'POST' })
        .then((raw) => {
          if (!disposed) applyWire(raw)
        })
        .catch((error: unknown) => {
          console.warn(`[dsh-liangxiang] local case cycle failed: ${error instanceof Error ? error.message : String(error)}`)
        })
    },
    getHistorySnapshot: () => historyState,
    subscribeHistory(listener) {
      historyListeners.add(listener)
      return () => historyListeners.delete(listener)
    },
    loadHistory,
    dispose: () => {
      disposed = true
      clearReconnect()
      if (stream !== null) {
        stream.close()
        stream = null
      }
      listeners.clear()
      historyListeners.clear()
    },
  }
}
