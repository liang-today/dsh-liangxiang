/**
 * `/liangbiao/api/*` handlers over the DSH web server seam (docs/044):
 *
 *   GET  /liangbiao/api/state   full wire state
 *   GET  /liangbiao/api/events  SSE push (one frame per revision + heartbeat)
 *   POST /liangbiao/api/vote    minimal vote intent -> result + fresh state
 *
 * The handler validates every request body at the boundary, bounds body
 * size, and owns SSE connection cleanup (`closeAllConnections` runs on
 * plugin dispose so unload leaves no open responses or timers).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WireError, parseWireVoteRequest } from '../shared/wire.ts'
import type { FakeAuthoritativeLiangService } from './fake-service.ts'

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
        fail(new WireError('vote', 'request body too large'))
        req.destroy()
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
  service: FakeAuthoritativeLiangService,
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
      const message = error instanceof Error ? error.message : String(error)
      writeJson(res, 400, { error: `invalid vote request: ${message}` })
      return
    }
    const outcome = service.vote(intent)
    writeJson(res, 200, {
      schemaVersion: outcome.state.schemaVersion,
      result: outcome.result,
      state: outcome.state,
    })
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    /* node:http always sets url on server requests */
    const pathname = new URL(req.url ?? '/', 'http://liangbiao.local').pathname
    if (!service.isReady) {
      writeJson(res, 503, { error: 'liangbiao host is still starting' })
      return
    }
    const methods: Record<string, string> = {
      '/liangbiao/api/state': 'GET',
      '/liangbiao/api/events': 'GET',
      '/liangbiao/api/vote': 'POST',
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
