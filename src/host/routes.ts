/**
 * `/liangxiang/api/*` handlers over the DSH web server seam (docs/044):
 *
 *   GET  /liangxiang/api/state      full wire state
 *   GET  /liangxiang/api/events     SSE push (one frame per revision + heartbeat)
 *   GET  /liangxiang/api/history    full 梁祠 archive or immutable version delta
 *   POST /liangxiang/api/vote       minimal vote intent -> result + fresh state
 *   POST /liangxiang/api/refresh    force host re-read (hover / panel open)
 *   POST /liangxiang/api/reconcile  drop local Token observation, re-read incense
 *   POST /liangxiang/api/local/enter       first-run welcome: switch this Host to local
 *   POST /liangxiang/api/local/cycle-case  LOCAL_FAKE_DEV only: next prepared 梁案
 *   POST /liangxiang/api/dev/credit LOCAL_FAKE_DEV only: simulate Token credit
 *
 * The handler validates every request body at the boundary, bounds body
 * size, and owns SSE connection cleanup (`closeAllConnections` runs on
 * plugin dispose so unload leaves no open responses or timers).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseWireVoteRequest } from '../shared/wire.ts'
import { parseDevCreditBody, resolveDevCreditTokens } from './dev-credit.ts'
import type { LiangHostService } from './service.ts'

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
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
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
  /** First-run welcome: switch this Host from online to the in-process loop. */
  chooseLocalMode?: () => void
}

export function createLiangxiangApi(
  service: LiangHostService,
  warn: (message: string) => void,
  options: LiangxiangApiOptions = {},
): LiangxiangApi {
  const connections = new Set<SseConnection>()

  const dropConnection = (connection: SseConnection): void => {
    if (!connections.delete(connection)) return
    connection.unsubscribe()
    clearInterval(connection.heartbeat)
  }

  const writeFrame = (res: ServerResponse): void => {
    const state = service.getWireState()
    res.write(`id: ${state.revision}\ndata: ${JSON.stringify(state)}\n\n`)
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
      unsubscribe: service.subscribe(() => {
        try {
          writeFrame(res)
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
    writeFrame(res)
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
    if (!service.isReady) {
      writeJson(res, 503, { error: 'liangxiang host is still starting' })
      return
    }
    const methods: Record<string, string> = {
      '/liangxiang/api/state': 'GET',
      '/liangxiang/api/events': 'GET',
      '/liangxiang/api/history': 'GET',
      '/liangxiang/api/vote': 'POST',
      '/liangxiang/api/refresh': 'POST',
      '/liangxiang/api/reconcile': 'POST',
      '/liangxiang/api/local/enter': 'POST',
      '/liangxiang/api/local/cycle-case': 'POST',
      '/liangxiang/api/dev/credit': 'POST',
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
      await service.reconcileNow?.()
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangxiang/api/local/enter') {
      options.chooseLocalMode?.()
      writeJson(res, 200, service.getWireState())
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
