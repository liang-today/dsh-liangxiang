/**
 * `/liangxiang/api/*` handlers over the DSH web server seam (docs/044):
 *
 *   GET  /liangxiang/api/state      full wire state
 *   GET  /liangxiang/api/events     SSE push (changed state + heartbeat)
 *   GET  /liangxiang/api/history    full 梁祠 archive or immutable version delta
 *   POST /liangxiang/api/vote       minimal vote intent -> result + fresh state
 *   POST /liangxiang/api/refresh    force host re-read (hover / panel open)
 *   POST /liangxiang/api/reconcile  drop local Token observation, re-read incense
 *   POST /liangxiang/api/mode              explicit persistent online/offline selection
 *   POST /liangxiang/api/local/cycle-case  LOCAL_FAKE_DEV only: next prepared 梁案
 *   POST /liangxiang/api/dev/credit LOCAL_FAKE_DEV only: simulate Token credit
 *
 * The handler validates every request body at the boundary, bounds body
 * size, and owns SSE connection cleanup (`closeAllConnections` runs on
 * plugin dispose so unload leaves no open responses or timers).
 */
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AUTHORITY_MODE_ACTION_HEADER, AUTHORITY_MODE_ACTION_VALUE, VOTE_RATE_LIMITED } from '../shared/index.ts'
import { parseWireVoteRequest, type HostAuthorityPreference } from '../shared/wire.ts'
import { BackendClientError } from './backend-client.ts'
import { parseDevCreditBody, resolveDevCreditTokens } from './dev-credit.ts'
import { DAY_END_ACTION_HEADER, DAY_END_ACTION_VALUE, parseDayEndPreferences, type DayEndPreferences } from '../shared/day-end.ts'
import type { LiangHostService } from './service.ts'
import { parseBarsQuery } from '../shared/bars-v1.ts'
import type { BarsQuery } from '../shared/bars-v1.ts'
import type { BarsRecorder } from './bars.ts'

const MAX_VOTE_BODY_BYTES = 4096
const SSE_HEARTBEAT_MS = 25_000

export interface LiangxiangApi {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  /** Dispose hook: ends every open SSE stream and clears heartbeats. */
  closeAllConnections: () => void
}

interface SseConnection {
  res: ServerResponse
  unsubscribe: () => void
  heartbeat: ReturnType<typeof setInterval>
  lastContent: string | null
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}


/** Viewport bounds for server-rendered charts; keeps a hostile `w` bounded. */
const BARS_SVG_WIDTH = { min: 320, max: 1_600, fallback: 720 } as const
const BARS_SVG_HEIGHT = { min: 160, max: 900, fallback: 320 } as const

function clampSvgSize(raw: string | null, bounds: { min: number; max: number; fallback: number }, label: string): number {
  if (raw === null || raw === '') return bounds.fallback
  if (!/^\d+$/.test(raw)) throw new Error(`${label} must be a positive integer`)
  return Math.min(bounds.max, Math.max(bounds.min, Number(raw)))
}

/**
 * Validate the SVG query: the shared window/interval fields plus presentation
 * knobs that only this route accepts.
 */
function parseBarsSvgQuery(search: URLSearchParams): { query: BarsQuery; width: number; height: number; theme: 'light' | 'dark' } {
  const allowed = new Set(['from', 'to', 'interval', 'theme', 'w', 'h'])
  for (const key of search.keys()) {
    if (!allowed.has(key)) throw new Error(`unknown query parameter ${key}`)
    if (search.getAll(key).length > 1) throw new Error(`${key} must appear at most once`)
  }
  const window = new URLSearchParams()
  for (const key of ['from', 'to', 'interval'] as const) {
    const value = search.get(key)
    if (value !== null) window.set(key, value)
  }
  const query = parseBarsQuery(window)
  const rawTheme = search.get('theme')
  if (rawTheme !== null && rawTheme !== 'light' && rawTheme !== 'dark') throw new Error('theme must be light or dark')
  return {
    query,
    width: clampSvgSize(search.get('w'), BARS_SVG_WIDTH, 'w'),
    height: clampSvgSize(search.get('h'), BARS_SVG_HEIGHT, 'h'),
    theme: rawTheme === 'dark' ? 'dark' : 'light',
  }
}

/** Distinguishes "caller sent too much" from a validation failure. */
class OversizedBodyError extends Error {}

function readBoundedBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    let done = false
    const fail = (error: Error): void => {
      if (done) return
      done = true
      reject(error)
    }
    req.on('data', (chunk: Buffer | string) => {
      body += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      if (body.length > MAX_VOTE_BODY_BYTES) {
        // Stop reading without destroying the socket: a killed connection is
        // indistinguishable from a network fault, and the caller must be able
        // to tell "rejected" from "outcome unknown" before retrying a vote.
        req.pause()
        fail(new OversizedBodyError('request body too large'))
      }
    })
    req.on('end', () => {
      if (done) return
      done = true
      resolve(body)
    })
    req.on('error', fail)
  })
}

export interface LiangxiangApiOptions {
  /** Manual configuration only; network failure never calls this path. */
  selectAuthorityMode: (preference: HostAuthorityPreference) => void | Promise<void>
  /** Lock mutating gameplay routes during the short authority handoff. */
  isAuthorityModeChanging?: () => boolean
  setDayEndPreferences?: (preferences: DayEndPreferences) => Promise<void>
  noteManualGesture?: () => void
  /** 走势 recorder; absent when the chart is disabled or unavailable. */
  bars?: BarsRecorder
}

export function createLiangxiangApi(
  service: LiangHostService,
  warn: (message: string) => void,
  options: LiangxiangApiOptions,
): LiangxiangApi {
  const connections = new Set<SseConnection>()

  const dropConnection = (connection: SseConnection): void => {
    if (!connections.delete(connection)) return
    connection.unsubscribe()
    clearInterval(connection.heartbeat)
  }

  const writeFrame = (connection: SseConnection): void => {
    const state = service.getWireState()
    // A successful authority read can advance revision without changing any
    // delivered field. Keep cadence/recovery intact while avoiding identical
    // full-state frames. Include every other field, especially epoch, authority
    // availability, broadcast expiry and archive/configuration cursors.
    const { revision, ...content } = state
    const serialized = JSON.stringify(content)
    if (serialized === connection.lastContent) return
    connection.res.write(`id: ${revision}\ndata: {"revision":${revision},${serialized.slice(1)}\n\n`)
    connection.lastContent = serialized
  }

  const handleEvents = (req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const connection: SseConnection = {
      res,
      lastContent: null,
      unsubscribe: service.subscribe(() => {
        try {
          writeFrame(connection)
        } catch (error) {
          warn(`[dsh-liangxiang] SSE write failed: ${error instanceof Error ? error.message : String(error)}`)
          dropConnection(connection)
        }
      }),
      heartbeat: setInterval(() => {
        res.write(': ping\n\n')
      }, SSE_HEARTBEAT_MS),
    }
    connections.add(connection)
    req.on('close', () => dropConnection(connection))
    writeFrame(connection)
  }

  const handleVote = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let intent
    try {
      const body = await readBoundedBody(req)
      intent = parseWireVoteRequest(JSON.parse(body) as unknown)
    } catch (error) {
      if (error instanceof OversizedBodyError) {
        res.setHeader('connection', 'close')
        writeJson(res, 413, { error: `vote body exceeds ${MAX_VOTE_BODY_BYTES} bytes` })
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      writeJson(res, 400, { error: `invalid vote request: ${message}` })
      return
    }
    try {
      // The authority may be in-process (local mode) or a backend round trip.
      const outcome = await service.vote(intent)
      writeJson(res, 200, {
        schemaVersion: outcome.state.schemaVersion,
        result: outcome.result,
        state: outcome.state,
      })
    } catch (error) {
      if (error instanceof BackendClientError && error.status === 429) {
        writeJson(res, 429, {
          error: {
            code: error.code ?? 'vote_rate_limited',
            message: VOTE_RATE_LIMITED,
          },
        })
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      warn(`[dsh-liangxiang] vote could not be resolved: ${message}`)
      writeJson(res, 502, { error: 'vote authority unavailable; retry with the same requestId' })
    }
  }

  const handleDevCredit = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const state = service.getWireState()
    const credit = service.creditSimulatedUsage
    if (credit === undefined) {
      writeJson(res, 404, { error: 'dev credit is not available on this host' })
      return
    }
    let intent
    try {
      const body = await readBoundedBody(req)
      intent = parseDevCreditBody(JSON.parse(body) as unknown)
    } catch (error) {
      if (error instanceof OversizedBodyError) {
        res.setHeader('connection', 'close')
        writeJson(res, 413, { error: `vote body exceeds ${MAX_VOTE_BODY_BYTES} bytes` })
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      writeJson(res, 400, { error: `invalid dev credit: ${message}` })
      return
    }
    try {
      credit(resolveDevCreditTokens(intent, state.personal.tokenPerIncense))
      writeJson(res, 200, service.getWireState())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeJson(res, 400, { error: `dev credit failed: ${message}` })
    }
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    /* node:http always sets url on server requests */
    const url = new URL(req.url ?? '/', 'http://liangxiang.local')
    const pathname = url.pathname
    const methods: Record<string, string> = {
      '/liangxiang/api/state': 'GET',
      '/liangxiang/api/events': 'GET',
      '/liangxiang/api/history': 'GET',
      '/liangxiang/api/vote': 'POST',
      '/liangxiang/api/refresh': 'POST',
      '/liangxiang/api/reconcile': 'POST',
      '/liangxiang/api/mode': 'POST',
      '/liangxiang/api/day-end': 'POST',
      '/liangxiang/api/vote-activity': 'POST',
      '/liangxiang/api/local/cycle-case': 'POST',
      '/liangxiang/api/dev/credit': 'POST',
      '/liangxiang/api/bars': 'GET',
      '/liangxiang/api/bars.svg': 'GET',
      '/liangxiang/api/bars/meta': 'GET',
    }
    const expected = methods[pathname]
    if (expected === undefined) {
      writeJson(res, 404, { error: 'unknown liangxiang route' })
      return
    }
    if (req.method !== expected) {
      writeJson(res, 405, { error: `method ${String(req.method)} not allowed` })
      return
    }
    // The mode route is the one startup action that may intentionally arrive
    // before the active service is ready. Its selector waits for persistent
    // storage and installs the chosen authority before returning a state.
    // The chart is read-only history derived from what this Host already
    // observed; it stays answerable while the authority handoff is still
    // settling, so the panel never shows an empty graph during a cold start.
    const isBarsRoute = pathname === '/liangxiang/api/bars'
      || pathname === '/liangxiang/api/bars.svg'
      || pathname === '/liangxiang/api/bars/meta'
    if (!service.isReady && pathname !== '/liangxiang/api/mode' && !isBarsRoute) {
      writeJson(res, 503, { error: 'liangxiang host is still starting' })
      return
    }
    if (pathname === '/liangxiang/api/state') {
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangxiang/api/events') {
      handleEvents(req, res)
      return
    }
    if (pathname === '/liangxiang/api/history') {
      try {
        const unknown = [...url.searchParams.keys()].filter(key => key !== 'after_version')
        if (unknown.length > 0) throw new Error(`unknown query parameter ${unknown[0]}`)
        const values = url.searchParams.getAll('after_version')
        if (values.length > 1) throw new Error('after_version must appear at most once')
        let afterVersion: number | undefined
        if (values.length === 1) {
          const raw = values[0] as string
          if (!/^\d+$/.test(raw)) throw new Error('after_version must be a non-negative integer')
          afterVersion = Number(raw)
          if (!Number.isSafeInteger(afterVersion)) throw new Error('after_version exceeds safe integer range')
        }
        writeJson(res, 200, await service.history(afterVersion))
      } catch (error) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }
    if (pathname === '/liangxiang/api/refresh') {
      await service.refreshNow?.()
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangxiang/api/reconcile') {
      if (options.isAuthorityModeChanging?.() === true) {
        writeJson(res, 503, { error: 'authority mode is changing; retry after the handoff' })
        return
      }
      await service.reconcileNow?.()
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangxiang/api/vote-activity') {
      if (req.headers[DAY_END_ACTION_HEADER] !== DAY_END_ACTION_VALUE) { writeJson(res, 403, { error: 'explicit gesture required' }); return }
      options.noteManualGesture?.()
      writeJson(res, 200, { ok: true })
      return
    }
    if (pathname === '/liangxiang/api/day-end') {
      if (req.headers[DAY_END_ACTION_HEADER] !== DAY_END_ACTION_VALUE
        || typeof req.headers['content-type'] !== 'string' || !req.headers['content-type'].startsWith('application/json')) {
        writeJson(res, 403, { error: 'explicit day-end action header required' }); return
      }
      if (options.setDayEndPreferences === undefined) { writeJson(res, 503, { error: 'day-end settings unavailable' }); return }
      try {
        const raw: unknown = JSON.parse(await readBoundedBody(req))
        const preferences = parseDayEndPreferences(raw)
        if (Object.keys(raw as object).some(k => k !== 'enabled' && k !== 'voteType')) throw new Error('unknown day-end setting')
        await options.setDayEndPreferences(preferences)
        writeJson(res, 200, service.getWireState())
      } catch (error) {
        if (error instanceof OversizedBodyError) { res.setHeader('connection', 'close'); writeJson(res, 413, { error: 'day-end body too large' }); return }
        writeJson(res, 400, { error: 'invalid or unavailable day-end settings' })
      }
      return
    }
    if (pathname === '/liangxiang/api/mode') {
      const action = req.headers[AUTHORITY_MODE_ACTION_HEADER]
      const contentType = req.headers['content-type']
      if (action !== AUTHORITY_MODE_ACTION_VALUE || typeof contentType !== 'string' || !contentType.startsWith('application/json')) {
        writeJson(res, 403, { error: 'explicit authority-mode action header required' })
        return
      }
      try {
        const raw = await readBoundedBody(req)
        const body = JSON.parse(raw) as unknown
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          throw new Error('expected an object')
        }
        const record = body as Record<string, unknown>
        if (Object.keys(record).length !== 1 || (record.mode !== 'online' && record.mode !== 'local')) {
          throw new Error('mode must be online/local and no other fields are allowed')
        }
        await options.selectAuthorityMode(record.mode)
      } catch (error) {
        if (error instanceof OversizedBodyError) {
          res.setHeader('connection', 'close')
          writeJson(res, 413, { error: `authority-mode body exceeds ${MAX_VOTE_BODY_BYTES} bytes` })
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        const status = message.includes('无法连接天庭') || message.includes('尚未加载') ? 503 : 400
        writeJson(res, status, { error: `authority-mode request failed: ${message}` })
        return
      }
      writeJson(res, 200, service.getWireState())
      return
    }
    if (options.isAuthorityModeChanging?.() === true) {
      writeJson(res, 503, { error: 'authority mode is changing; retry after the handoff' })
      return
    }
    if (pathname === '/liangxiang/api/local/cycle-case') {
      const cycle = service.cycleLocalCase
      if (cycle === undefined) {
        writeJson(res, 404, { error: 'local case cycling is not available on this host' })
        return
      }
      cycle()
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangxiang/api/dev/credit') {
      await handleDevCredit(req, res)
      return
    }
    if (pathname === '/liangxiang/api/bars/meta') {
      const bars = options.bars
      if (bars === undefined) {
        writeJson(res, 503, { error: '走势 is unavailable on this host' })
        return
      }
      writeJson(res, 200, bars.meta())
      return
    }
    if (pathname === '/liangxiang/api/bars') {
      const bars = options.bars
      if (bars === undefined) {
        writeJson(res, 503, { error: '走势 is unavailable on this host' })
        return
      }
      let query: BarsQuery
      try {
        query = parseBarsQuery(url.searchParams)
      } catch (error) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
        return
      }
      try {
        writeJson(res, 200, bars.read(query))
      } catch {
        // A bad day file is derived data: report it, never break the loop.
        writeJson(res, 503, { error: '走势 is temporarily unavailable' })
      }
      return
    }
    if (pathname === '/liangxiang/api/bars.svg') {
      const bars = options.bars
      if (bars === undefined) {
        writeJson(res, 503, { error: '走势 is unavailable on this host' })
        return
      }
      try {
        const { query, width, height, theme } = parseBarsSvgQuery(url.searchParams)
        let body: string
        try {
          body = bars.svg(query, { width, height, theme })
        } catch {
          writeJson(res, 503, { error: '走势 is temporarily unavailable' })
          return
        }
        const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`
        // A window that still contains live data must never be cached: the file
        // behind it is rewritten as new samples arrive.
        const live = query.to === null || query.to > Date.now() - 5 * 60_000
        res.writeHead(200, {
          'content-type': 'image/svg+xml; charset=utf-8',
          'cache-control': live ? 'no-store' : 'public, max-age=300',
          'etag': etag,
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
        })
        res.end(body)
        return
      } catch (error) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
        return
      }
    }
    await handleVote(req, res)
  }

  return {
    handler,
    closeAllConnections: (): void => {
      // Deleting the current entry during Set iteration is spec-safe.
      for (const connection of connections) {
        dropConnection(connection)
        connection.res.end()
      }
    },
  }
}
