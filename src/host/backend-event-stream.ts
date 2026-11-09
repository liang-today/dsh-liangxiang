/**
 * One abortable, bounded server-sent-event connection from Host to Backend.
 * This is transport only: callers validate every message before adopting it.
 * No message history is retained and a reconnect starts with a fresh snapshot.
 */
export type BackendStreamStatus = 'connecting' | 'connected' | 'disconnected' | 'unsupported'

export interface BackendEventStreamOptions {
  url: string
  headers: () => Record<string, string>
  onMessage: (data: string, event: string) => void
  onStatus: (status: BackendStreamStatus) => void
  onActivity?: () => void
  onError?: (error: Error) => void
  fetchImpl?: typeof fetch
  connectTimeoutMs?: number
  idleTimeoutMs?: number
  retryMinMs?: number
  retryMaxMs?: number
  maxEventBytes?: number
  /** Injectable jitter source for deterministic transport tests. */
  random?: () => number
}

/** Headers are re-created per attempt so signed request timestamps stay fresh. */
export function startBackendEventStream(options: BackendEventStreamOptions): () => void {
  const doFetch = options.fetchImpl ?? fetch
  const retryMin = options.retryMinMs ?? 1_000
  const retryMax = options.retryMaxMs ?? 30_000
  const maxBytes = options.maxEventBytes ?? 256 * 1024
  let disposed = false
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let deadline: ReturnType<typeof setTimeout> | null = null
  let retryDelay = retryMin

  const clearDeadline = (): void => {
    if (deadline !== null) clearTimeout(deadline)
    deadline = null
  }
  const armDeadline = (milliseconds: number, active: AbortController): void => {
    clearDeadline()
    deadline = setTimeout(() => active.abort(), milliseconds)
    deadline.unref?.()
  }
  const status = (value: BackendStreamStatus): void => {
    if (!disposed) options.onStatus(value)
  }

  const run = async (): Promise<void> => {
    if (disposed) return
    retryTimer = null
    const active = new AbortController()
    controller = active
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    let unsupported = false
    let openedAt = 0
    let receivedState = false
    status('connecting')
    armDeadline(options.connectTimeoutMs ?? 6_000, active)
    try {
      const response = await doFetch(options.url, {
        method: 'GET',
        headers: { ...options.headers(), accept: 'text/event-stream' },
        signal: active.signal,
        cache: 'no-store',
      })
      if (disposed || active.signal.aborted) return
      if (response.status === 404 || response.status === 405 || response.status === 501) {
        unsupported = true
        void response.body?.cancel().catch(() => undefined)
        status('unsupported')
        return
      }
      if (!response.ok || response.body === null) {
        void response.body?.cancel().catch(() => undefined)
        throw new Error(`backend event stream returned HTTP ${response.status}`)
      }
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
        void response.body?.cancel().catch(() => undefined)
        throw new Error('backend event stream has an unexpected content type')
      }
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      let event = 'message'
      let data: string[] = []
      let dataSize = 0
      openedAt = Date.now()
      status('connected')
      armDeadline(options.idleTimeoutMs ?? 70_000, active)
      while (!disposed && !active.signal.aborted) {
        const part = await reader.read()
        if (part.done) break
        options.onActivity?.()
        armDeadline(options.idleTimeoutMs ?? 70_000, active)
        pending += decoder.decode(part.value, { stream: true })
        if (pending.length + dataSize > maxBytes) throw new Error('backend event stream frame is too large')
        let end: number
        while ((end = pending.indexOf('\n')) !== -1) {
          let line = pending.slice(0, end)
          pending = pending.slice(end + 1)
          if (line.endsWith('\r')) line = line.slice(0, -1)
          if (line === '') {
            if (data.length > 0 && !disposed) {
              options.onMessage(data.join('\n'), event)
              receivedState = true
            }
            event = 'message'
            data = []
            dataSize = 0
            continue
          }
          if (line.startsWith(':')) continue
          const colon = line.indexOf(':')
          const field = colon === -1 ? line : line.slice(0, colon)
          let value = colon === -1 ? '' : line.slice(colon + 1)
          if (value.startsWith(' ')) value = value.slice(1)
          if (field === 'event') event = value
          if (field === 'data') {
            data.push(value)
            dataSize += value.length + 1
            if (dataSize > maxBytes) throw new Error('backend event stream frame is too large')
          }
        }
      }
    } catch (error) {
      if (!disposed) options.onError?.(error instanceof Error ? error : new Error(String(error)))
    } finally {
      clearDeadline()
      active.abort()
      // Transport teardown must not hold the retry loop forever if a network
      // implementation stalls its cancellation promise after an aborted read.
      void reader?.cancel().catch(() => undefined)
      reader?.releaseLock()
      if (controller === active) controller = null
      if (!disposed && !unsupported) {
        status('disconnected')
        // Headers alone are not a healthy connection. Flapping streams retain
        // backoff, and independent Hosts do not reconnect in synchronized waves.
        if (receivedState && Date.now() - openedAt >= 30_000) retryDelay = retryMin
        const random = Math.max(0, Math.min(1, (options.random ?? Math.random)()))
        const delay = Math.max(1, Math.round(retryDelay * (0.5 + random * 0.5)))
        retryTimer = setTimeout(() => { void run() }, delay)
        retryTimer.unref?.()
        retryDelay = Math.min(retryMax, retryDelay * 2)
      }
    }
  }

  void run()
  return (): void => {
    if (disposed) return
    disposed = true
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
    clearDeadline()
    controller?.abort()
  }
}
