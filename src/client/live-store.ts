/**
 * Live host-backed store: bootstrap over GET /state, push over SSE, votes
 * over POST /vote with client-generated idempotent request IDs.
 *
 * Failure posture:
 *  - every fetch is timeout-bounded and abortable;
 *  - one vote retry reuses the SAME requestId (never a fresh id to escape an
 *    uncertain outcome);
 *  - request ids come from `randomRequestId()` (request-id.ts), which never
 *    depends on `crypto.randomUUID` being available, so a DSH Web UI served
 *    over plain HTTP on a LAN address can still vote (issue #26);
 *  - SSE errors are counted; after a bounded number the stream closes and
 *    the store goes `offline` (the UI keeps rendering the last known state),
 *    then reconnects automatically with bounded exponential backoff;
 *  - `refresh()` retries immediately when offline; while live it POSTs `/refresh` so
 *    hover / panel-open can force a host re-bootstrap instead of waiting for
 *    the next 1s snapshot poll. No extra background poll loop.
 */
import type { LiangHistoryArchive, VoteResult, VoteType } from '../domain/index.ts'
import { parseWireState, parseWireVoteResponse, type HostAuthorityPreference } from '../shared/wire.ts'
import { mergeHistoryArchive, parseV1HistoryResponse } from '../shared/history-v1.ts'
import { AUTHORITY_MODE_ACTION_HEADER, AUTHORITY_MODE_ACTION_VALUE } from '../shared/index.ts'
import { DAY_END_ACTION_HEADER, DAY_END_ACTION_VALUE, type DayEndPreferences } from '../shared/day-end.ts'
import { snapshotRefreshMs } from '../shared/snapshot-cadence.ts'
import { randomRequestId } from './request-id.ts'
import { browserEvents, createBrowserRequests, HOST_API } from './browser-request.ts'
import {
  createOfflineViewState,
  wireToViewState,
  type LiangxiangStore,
  type LiangxiangViewState,
} from './store.ts'

const STATE_PATH = `${HOST_API}/state`
const EVENTS_PATH = `${HOST_API}/events`
const VOTE_PATH = `${HOST_API}/vote`
const REFRESH_PATH = `${HOST_API}/refresh`
const RECONCILE_PATH = `${HOST_API}/reconcile`
const MODE_PATH = `${HOST_API}/mode`
const CYCLE_CASE_PATH = `${HOST_API}/local/cycle-case`
const HISTORY_PATH = `${HOST_API}/history`
const VOTE_RETRY_DELAY_MS = 400
const MAX_SSE_ERRORS = 5
const RECONNECT_INITIAL_MS = 1_000
const RECONNECT_MAX_MS = 30_000
/** Hover may fire often; skip if a live refresh ran this recently. */
const MIN_LIVE_REFRESH_MS = 2_000

/** Injectable transport (real fetch/EventSource in the browser, fakes in tests). */
export interface LiveStoreTransport {
  fetchJson(path: string, init?: { method?: string, body?: string, headers?: Record<string, string> }): Promise<unknown>
  openEvents(path: string, handlers: { onFrame(data: string): void, onError(closed?: boolean): void }): { close(): void }
  randomRequestId(): string
  /** Abort browser fetches owned by this transport. */
  dispose?(): void
}

export class LiveTransportError extends Error {
  constructor(readonly status: number, path: string) {
    super(`HTTP ${status} for ${path}`)
    this.name = 'LiveTransportError'
  }
}

/** Real browser transport; exported so the non-secure-context path stays testable. */
export function createBrowserTransport(): LiveStoreTransport {
  const requests = createBrowserRequests()
  return {
    async fetchJson(path, init) {
      return (await requests.json(path, init, response => {
        if (!response.ok) {
          throw new LiveTransportError(response.status, path)
        }
      }))[0]
    },
    openEvents(path, handlers) {
      return browserEvents(path, handlers.onFrame, handlers.onError)
    },
    randomRequestId: () => randomRequestId(),
    dispose: requests.dispose,
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
  /** Persist and apply an explicit mode selection; never called by reconnect. */
  setDayEndPreferences(preferences: DayEndPreferences): Promise<void>
  noteVoteActivity(): void
  selectAuthorityMode(preference: HostAuthorityPreference): Promise<void>
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
  let streamGeneration = 0
  let sseErrors = 0
  let disposed = false
  let starting = false
  let refreshInFlight = false
  let reconcileInFlight = false
  let lastLiveRefreshAt = Number.NEGATIVE_INFINITY
  let liveRefreshMs = MIN_LIVE_REFRESH_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectBackoffMs = RECONNECT_INITIAL_MS
  const listeners = new Set<() => void>()
  let historyState: LiangciHistoryState = { status: 'idle', archive: null, error: null }
  let historyInFlight: Promise<void> | null = null
  let historyEpoch = 0
  const historyListeners = new Set<() => void>()
  const retryWaits = new Set<{
    timer: ReturnType<typeof setTimeout>
    reject(error: Error): void
  }>()

  const waitForVoteRetry = (): Promise<void> => new Promise((resolve, reject) => {
    const pending = {
      timer: setTimeout(() => {
        retryWaits.delete(pending)
        resolve()
      }, VOTE_RETRY_DELAY_MS),
      reject,
    }
    retryWaits.add(pending)
  })

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
    const epoch = historyEpoch
    const run = transport.fetchJson(path)
      .then((raw) => {
        if (disposed || epoch !== historyEpoch) return
        const incoming = parseV1HistoryResponse(raw)
        const archive = mergeHistoryArchive(historyState.archive, incoming)
        setHistoryState({
          status: archive.stale ? 'stale' : 'ready',
          archive,
          error: archive.stale ? '档案未更新' : null,
        })
      })
      .catch((error: unknown) => {
        if (disposed || epoch !== historyEpoch) return
        const message = error instanceof Error ? error.message : String(error)
        const archive = historyState.archive === null ? null : { ...historyState.archive, stale: true }
        setHistoryState({ status: 'stale', archive, error: `档案未更新：${message}` })
      })
      .finally(() => {
        if (epoch === historyEpoch) historyInFlight = null
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
    if (lastWire !== null && wire.authorityMode !== lastWire.authorityMode) {
      // Each authority owns its own revision and archive cursor. A manual
      // switch must accept a lower target revision and must never merge the
      // other authority's 梁祠 rows into this one.
      lastRevision = -1
      historyEpoch += 1
      historyInFlight = null
      setHistoryState({ status: 'idle', archive: null, error: null })
    }
    if (wire.revision > lastRevision) {
      lastRevision = wire.revision
      liveRefreshMs = Math.max(MIN_LIVE_REFRESH_MS, snapshotRefreshMs(wire.snapshotRefreshSeconds))
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
    if (disposed) return
    streamGeneration++
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
    const generation = ++streamGeneration
    const next = transport.openEvents(EVENTS_PATH, {
      onFrame: (data) => {
        if (disposed || generation !== streamGeneration) return
        try {
          applyWire(JSON.parse(data) as unknown)
          sseErrors = 0
          reconnectBackoffMs = RECONNECT_INITIAL_MS
        } catch {
          // Drop a bad frame; the next one or the refresh path recovers.
        }
      },
      onError: (closed) => {
        if (disposed || generation !== streamGeneration) return
        sseErrors += 1
        if (closed || sseErrors >= MAX_SSE_ERRORS) goOffline()
      },
    })
    if (disposed || generation !== streamGeneration) next.close()
    else stream = next
  }

  const bootstrap = (): void => {
    if (disposed || starting) return
    starting = true
    transport.fetchJson(STATE_PATH)
      .then((raw) => {
        starting = false
        if (disposed) return
        clearReconnect()
        applyWire(raw)
        openStream()
        // One full archive per Host connection; subsequent updates are deltas.
        void loadHistory()
      })
      .catch(() => {
        starting = false
        goOffline()
      })
  }

  const selectAuthorityMode = (preference: HostAuthorityPreference): Promise<void> => {
    if (disposed) return Promise.reject(new Error('梁相连接已关闭，无法切换模式'))
    return transport.fetchJson(MODE_PATH, {
      method: 'POST',
      body: JSON.stringify({ mode: preference }),
      headers: { [AUTHORITY_MODE_ACTION_HEADER]: AUTHORITY_MODE_ACTION_VALUE },
    })
      .then((raw) => {
        if (!disposed) {
          applyWire(raw)
          void loadHistory()
        }
      })
      .catch((error: unknown) => {
        throw error
      })
  }

  const pullLatest = (force: boolean): void => {
    if (disposed || refreshInFlight || starting) return
    const now = Date.now()
    if (!force && now - lastLiveRefreshAt < liveRefreshMs) return
    refreshInFlight = true
    lastLiveRefreshAt = now
    transport.fetchJson(REFRESH_PATH, { method: 'POST' })
      .then((raw) => {
        if (!disposed) applyWire(raw)
      })
      .catch(() => {
        // Refresh is best-effort; the next cadence or reconnect recovers.
      })
      .finally(() => {
        refreshInFlight = false
      })
  }

  const postVote = async (
    voteType: VoteType,
    requestId: string,
    count?: number,
  ): Promise<VoteResult> => {
    const body = JSON.stringify({
      caseId: state.activeCase.id,
      voteType,
      requestId,
      ...(count === undefined ? {} : { count }),
    })
    const attempt = (): Promise<unknown> => transport.fetchJson(VOTE_PATH, { method: 'POST', body })
    let raw: unknown
    try {
      raw = await attempt()
    } catch (error) {
      if (error instanceof LiveTransportError && error.status >= 400 && error.status < 500) throw error
      // One bounded retry with the SAME requestId — idempotency, not a new intent.
      if (disposed) throw new Error('梁相连接已关闭')
      await waitForVoteRetry()
      if (disposed) throw new Error('梁相连接已关闭')
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
    vote: (voteType, options) => postVote(voteType, transport.randomRequestId(), options?.count),
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
          throw error
        })
        .finally(() => {
          reconcileInFlight = false
        })
    },
    selectAuthorityMode,
    noteVoteActivity: () => {
      if (disposed || !state.dayEnd?.enabled) return
      void transport.fetchJson(`${HOST_API}/vote-activity`, {
        method: 'POST', headers: { [DAY_END_ACTION_HEADER]: DAY_END_ACTION_VALUE },
      }).catch(() => undefined)
    },
    setDayEndPreferences: async (preferences) => {
      if (disposed) throw new Error('梁相连接已关闭')
      const raw = await transport.fetchJson(`${HOST_API}/day-end`, {
        method: 'POST', body: JSON.stringify(preferences),
        headers: { [DAY_END_ACTION_HEADER]: DAY_END_ACTION_VALUE },
      })
      if (!disposed) applyWire(raw)
    },
    cycleLocalCase: () => {
      if (disposed || starting) return
      if (state.authorityMode !== 'LOCAL_FAKE_DEV') return
      transport.fetchJson(CYCLE_CASE_PATH, { method: 'POST' })
        .then((raw) => {
          if (!disposed) applyWire(raw)
        })
        .catch(() => undefined)
    },
    getHistorySnapshot: () => historyState,
    subscribeHistory(listener) {
      historyListeners.add(listener)
      return () => historyListeners.delete(listener)
    },
    loadHistory,
    dispose: () => {
      if (disposed) return
      disposed = true
      streamGeneration++
      clearReconnect()
      for (const pending of retryWaits) {
        clearTimeout(pending.timer)
        pending.reject(new Error('梁相连接已关闭'))
      }
      retryWaits.clear()
      if (stream !== null) {
        stream.close()
        stream = null
      }
      listeners.clear()
      historyListeners.clear()
      transport.dispose?.()
    },
  }
}
