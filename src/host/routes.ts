/**
 * `/liangbiao/api/*` handlers over the DSH web server seam (docs/044):
 *
 *   GET  /liangbiao/api/state      full wire state
 *   GET  /liangbiao/api/events     SSE push (one frame per revision + heartbeat)
 *   GET  /liangbiao/api/history    full 梁祠 archive or immutable version delta
 *   POST /liangbiao/api/vote       minimal vote intent -> result + fresh state
 *   POST /liangbiao/api/refresh    force host re-read (hover / panel open)
 *   POST /liangbiao/api/reconcile  drop local Token observation, re-read incense
 *   POST /liangbiao/api/local/cycle-case  LOCAL_FAKE_DEV only: next prepared 梁案
 *   POST /liangbiao/api/dev/credit LOCAL_FAKE_DEV only: simulate Token credit
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

export interface LiangbiaoApi {
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

export function createLiangbiaoApi(
  service: LiangHostService,
  warn: (message: string) => void,
): LiangbiaoApi {
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
          warn(`[dsh-liangbiao] SSE write failed: ${error instanceof Error ? error.message : String(error)}`)
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
      warn(`[dsh-liangbiao] vote could not be resolved: ${message}`)
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
    const url = new URL(req.url ?? '/', 'http://liangbiao.local')
    const pathname = url.pathname
    if (!service.isReady) {
      writeJson(res, 503, { error: 'liangbiao host is still starting' })
      return
    }
    const methods: Record<string, string> = {
      '/liangbiao/api/state': 'GET',
      '/liangbiao/api/events': 'GET',
      '/liangbiao/api/history': 'GET',
      '/liangbiao/api/vote': 'POST',
      '/liangbiao/api/refresh': 'POST',
      '/liangbiao/api/reconcile': 'POST',
      '/liangbiao/api/local/cycle-case': 'POST',
      '/liangbiao/api/dev/credit': 'POST',
    }
    const expected = methods[pathname]
    if (expected === undefined) {
      writeJson(res, 404, { error: 'unknown liangbiao route' })
      return
    }
    if (req.method !== expected) {
      writeJson(res, 405, { error: `method ${String(req.method)} not allowed` })
      return
    }
    if (pathname === '/liangbiao/api/state') {
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangbiao/api/events') {
      handleEvents(req, res)
      return
    }
    if (pathname === '/liangbiao/api/history') {
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
    if (pathname === '/liangbiao/api/refresh') {
      await service.refreshNow?.()
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangbiao/api/reconcile') {
      await service.reconcileNow?.()
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangbiao/api/local/cycle-case') {
      const cycle = service.cycleLocalCase
      if (cycle === undefined) {
        writeJson(res, 404, { error: 'local case cycling is not available on this host' })
        return
      }
      cycle()
      writeJson(res, 200, service.getWireState())
      return
    }
    if (pathname === '/liangbiao/api/dev/credit') {
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
