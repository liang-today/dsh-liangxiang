/**
 * `/v1` HTTP surface over node:http.
 *
 *   GET  /v1/bootstrap       policy + active case + personal state + snapshot
 *   POST /v1/token-claims    record the host's (unverifiable) Token claim
 *   POST /v1/votes           the vote transaction
 *   GET  /v1/snapshot        the published global snapshot
 *   GET  /v1/me/daily-state  cheap personal refresh
 *   GET  /v1/health          liveness + authority mode
 *
 * Boundary rules: every body is size-bounded and schema-validated, the
 * installation header is required and pattern-checked, votes are rate-limited
 * per installation, and errors are structured `{ error: { code, message } }`.
 * Request logs carry only method/path/status/installation prefix — never a
 * prompt, response, path, or key.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { WireError } from '../shared/wire.ts'
import {
  BACKEND_API_PREFIX,
  INSTALLATION_HEADER,
  parseInstallationId,
  parseV1TokenClaimRequest,
  parseV1VoteRequest,
  type V1ErrorBody,
  type V1ErrorCode,
} from '../shared/backend-v1.ts'
import type { LiangbiaoBackendService } from './service.ts'

const MAX_BODY_BYTES = 4096
const RATE_WINDOW_MS = 60_000

export interface BackendHttpOptions {
  service: LiangbiaoBackendService
  /** Per-installation vote requests per minute; 0 disables the limit. */
  voteRateLimitPerMinute: number
  log?: (message: string) => void
}

export interface BackendHttpApi {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  server: Server
  /** Clear the rate-limit window bookkeeping (dispose/tests). */
  reset: () => void
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function writeError(res: ServerResponse, status: number, code: V1ErrorCode, message: string, field?: string): void {
  const body: V1ErrorBody = { error: field === undefined ? { code, message } : { code, message, field } }
  writeJson(res, status, body)
}

/** Distinguishes "caller sent too much" from a validation failure. */
class OversizedBodyError extends Error {}

function readBoundedBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk: Buffer | string) => {
      body += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      if (body.length > MAX_BODY_BYTES) {
        // Stop reading but do NOT destroy the socket: a truncated connection
        // reads as a network fault, and a client that cannot tell "rejected"
        // from "unknown" may retry a vote it should not. Answer 413 instead.
        req.pause()
        fail(new OversizedBodyError('request body too large'))
      }
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(body)
    })
    req.on('error', fail)
  })
}

/** HTTP status for a rejected-but-valid vote outcome. */
function statusForRejection(reason: string): number {
  if (reason === 'idempotency_conflict') return 409
  if (reason === 'insufficient_incense') return 409
  if (reason === 'stale_case' || reason === 'case_not_active') return 409
  return 400
}

export function createBackendHttpApi(options: BackendHttpOptions): BackendHttpApi {
  const { service, voteRateLimitPerMinute } = options
  const log = options.log ?? ((message: string) => console.log(message))
  /** installation -> timestamps of recent vote attempts (bounded window). */
  const voteWindows = new Map<string, number[]>()

  const rateLimited = (installationId: string, now: number): boolean => {
    if (voteRateLimitPerMinute <= 0) return false
    const window = (voteWindows.get(installationId) ?? []).filter((at) => now - at < RATE_WINDOW_MS)
    if (window.length >= voteRateLimitPerMinute) {
      voteWindows.set(installationId, window)
      return true
    }
    window.push(now)
    voteWindows.set(installationId, window)
    return false
  }

  const installationOf = (req: IncomingMessage): string => {
    const raw = req.headers[INSTALLATION_HEADER]
    return parseInstallationId(Array.isArray(raw) ? raw[0] : raw)
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://liangbiao.backend')
    const path = url.pathname
    const method = req.method ?? 'GET'
    const routes: Record<string, string> = {
      [`${BACKEND_API_PREFIX}/health`]: 'GET',
      [`${BACKEND_API_PREFIX}/bootstrap`]: 'GET',
      [`${BACKEND_API_PREFIX}/snapshot`]: 'GET',
      [`${BACKEND_API_PREFIX}/me/daily-state`]: 'GET',
      [`${BACKEND_API_PREFIX}/token-claims`]: 'POST',
      [`${BACKEND_API_PREFIX}/votes`]: 'POST',
    }
    const expected = routes[path]
    if (expected === undefined) {
      writeError(res, 404, 'unknown_route', `unknown route ${path}`)
      return
    }
    if (method !== expected) {
      writeError(res, 405, 'method_not_allowed', `method ${method} not allowed for ${path}`)
      return
    }

    if (path === `${BACKEND_API_PREFIX}/health`) {
      writeJson(res, 200, {
        status: 'ok',
        authority_mode: service.authorityMode,
        business_date: service.businessDate(),
      })
      return
    }
    if (path === `${BACKEND_API_PREFIX}/snapshot`) {
      // Public read: no installation identity involved.
      writeJson(res, 200, service.snapshotResponse())
      return
    }

    let installationId: string
    try {
      installationId = installationOf(req)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeError(res, 401, 'missing_installation', `installation header invalid: ${message}`, INSTALLATION_HEADER)
      return
    }

    if (path === `${BACKEND_API_PREFIX}/bootstrap`) {
      writeJson(res, 200, service.bootstrap(installationId))
      return
    }
    if (path === `${BACKEND_API_PREFIX}/me/daily-state`) {
      writeJson(res, 200, service.dailyState(installationId))
      return
    }

    let body: unknown
    try {
      const raw = await readBoundedBody(req)
      body = raw === '' ? {} : (JSON.parse(raw) as unknown)
    } catch (error) {
      if (error instanceof OversizedBodyError) {
        res.setHeader('connection', 'close')
        writeError(res, 413, 'invalid_request', `request body exceeds ${MAX_BODY_BYTES} bytes`)
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      writeError(res, 400, 'invalid_request', `invalid request body: ${message}`)
      return
    }

    if (path === `${BACKEND_API_PREFIX}/token-claims`) {
      try {
        const claim = parseV1TokenClaimRequest(body)
        writeJson(res, 200, service.applyTokenClaim(installationId, claim))
      } catch (error) {
        writeValidationError(res, error)
      }
      return
    }

    // POST /v1/votes
    if (rateLimited(installationId, Date.now())) {
      writeError(res, 429, 'invalid_request', 'too many vote requests; slow down')
      return
    }
    try {
      const intent = parseV1VoteRequest(body)
      const response = service.vote(installationId, intent)
      const status = response.result.status === 'accepted' ? 200 : statusForRejection(response.result.reason)
      writeJson(res, status, response)
      log(
        `[liangbiao-backend] POST /v1/votes ${status} installation=${installationId.slice(0, 8)}… `
        + `result=${response.result.status}`,
      )
    } catch (error) {
      writeValidationError(res, error)
    }
  }

  const server = createServer((req, res) => {
    handler(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      log(`[liangbiao-backend] unhandled request failure: ${message}`)
      if (!res.headersSent) writeError(res, 500, 'internal_error', 'internal error')
      else res.end()
    })
  })

  return {
    handler,
    server,
    reset: () => voteWindows.clear(),
  }
}

function writeValidationError(res: ServerResponse, error: unknown): void {
  if (error instanceof WireError) {
    writeError(res, 400, 'invalid_request', error.message, error.field)
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeError(res, 400, 'invalid_request', message)
}
