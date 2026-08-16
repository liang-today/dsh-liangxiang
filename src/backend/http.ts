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
 * Boundary rules: every body is size-bounded and schema-validated, signed
 * community identity is required unless `allowUnsigned` is on (localhost
 * smoke / legacy tests), votes are rate-limited per installation, and errors
 * are structured `{ error: { code, message } }`. Request logs carry only
 * method/path/status/installation prefix — never a prompt, response, path, or key.
 */
import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { formatLiangPosition } from '../domain/index.ts'
import { WireError } from '../shared/wire.ts'
import {
  BACKEND_API_PREFIX,
  COMMUNITY_KEY_HEADER,
  DEVICE_HEADER,
  INSTALLATION_HEADER,
  PUBLIC_KEY_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  parseInstallationId,
  parseV1TokenClaimRequest,
  parseV1VoteRequest,
  type V1ErrorBody,
  type V1ErrorCode,
} from '../shared/backend-v1.ts'
import { authenticateCommunityRequest, CommunityAuthError } from './community-auth.ts'
import type { LiangbiaoBackendService } from './service.ts'
import type { BackendStore } from './store.ts'

const MAX_BODY_BYTES = 4096
const RATE_WINDOW_MS = 60_000
/** Sweep the rate-limit map once it grows past this many installations. */
const RATE_WINDOW_EVICT_THRESHOLD = 1_000

export interface BackendHttpOptions {
  service: LiangbiaoBackendService
  store: BackendStore
  /** Per-installation vote requests per minute; 0 disables the limit. */
  voteRateLimitPerMinute: number
  /** Accept the old unsigned installation header (localhost tests / curl smoke). */
  allowUnsigned?: boolean
  /** Shared admission secret; null/undefined means not required. */
  communityKey?: string | null
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

function peerAddress(req: IncomingMessage): string {
  const raw = req.socket.remoteAddress ?? '?'
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw
}

function installShort(installationId: string): string {
  return installationId.length <= 12 ? installationId : `${installationId.slice(0, 12)}…`
}

function who(req: IncomingMessage, installationId: string): string {
  return `install=${installShort(installationId)} ip=${peerAddress(req)}`
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === undefined || value === '' ? undefined : value
}

function communityKeyMatches(expected: string, presented: string): boolean {
  const left = Buffer.from(expected)
  const right = Buffer.from(presented)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function createBackendHttpApi(options: BackendHttpOptions): BackendHttpApi {
  const { service, store, voteRateLimitPerMinute } = options
  const allowUnsigned = options.allowUnsigned === true
  const communityKey = options.communityKey ?? null
  const log = options.log ?? ((message: string) => console.log(message))
  /** installation -> timestamps of recent vote attempts (bounded window). */
  const voteWindows = new Map<string, number[]>()

  /**
   * Drop windows that can no longer rate-limit anything. Without this the map
   * would keep one entry per installation id ever seen — and ids are
   * self-minted, so that is attacker-controlled unbounded growth.
   */
  const evictStaleWindows = (now: number): void => {
    for (const [installationId, window] of voteWindows) {
      const newest = window.at(-1)
      if (newest === undefined || now - newest >= RATE_WINDOW_MS) voteWindows.delete(installationId)
    }
  }

  const rateLimited = (installationId: string, now: number): boolean => {
    if (voteRateLimitPerMinute <= 0) return false
    if (voteWindows.size > RATE_WINDOW_EVICT_THRESHOLD) evictStaleWindows(now)
    const window = (voteWindows.get(installationId) ?? []).filter((at) => now - at < RATE_WINDOW_MS)
    if (window.length >= voteRateLimitPerMinute) {
      voteWindows.set(installationId, window)
      return true
    }
    window.push(now)
    voteWindows.set(installationId, window)
    return false
  }

  const authenticate = (req: IncomingMessage, method: string, path: string, rawBody: string): string => {
    if (communityKey !== null) {
      const presented = headerValue(req, COMMUNITY_KEY_HEADER)
      if (presented === undefined || !communityKeyMatches(communityKey, presented)) {
        throw new CommunityAuthError(401, 'invalid_signature', 'community key required')
      }
    }

    const publicKey = headerValue(req, PUBLIC_KEY_HEADER)
    const signature = headerValue(req, SIGNATURE_HEADER)
    const timestamp = headerValue(req, TIMESTAMP_HEADER)
    const signed = publicKey !== undefined && signature !== undefined && timestamp !== undefined

    if (!signed) {
      if (!allowUnsigned) {
        throw new CommunityAuthError(401, 'invalid_signature', 'signed identity headers required')
      }
      return parseInstallationId(headerValue(req, INSTALLATION_HEADER))
    }

    const installationId = parseInstallationId(headerValue(req, INSTALLATION_HEADER))
    const device = headerValue(req, DEVICE_HEADER) ?? null
    return authenticateCommunityRequest({
      store,
      method,
      path,
      body: rawBody,
      installationId,
      publicKey,
      signature,
      timestamp,
      deviceFingerprint: device,
      now: Date.now(),
    })
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

    let rawBody = ''
    if (method === 'POST') {
      try {
        rawBody = await readBoundedBody(req)
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
    }

    let installationId: string
    try {
      installationId = authenticate(req, method, path, rawBody)
    } catch (error) {
      if (error instanceof CommunityAuthError) {
        writeError(res, error.httpStatus, error.code, error.message)
        const install = headerValue(req, INSTALLATION_HEADER)
        if (install !== undefined) {
          log(
            `[liangbiao-backend] deny ${error.httpStatus} ${error.code} `
            + `${who(req, install)} ${method} ${path}`,
          )
        }
        return
      }
      if (error instanceof WireError) {
        writeError(res, 401, 'missing_installation', `installation header invalid: ${error.message}`, error.field)
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      writeError(res, 401, 'missing_installation', `installation header invalid: ${message}`, INSTALLATION_HEADER)
      return
    }

    if (path === `${BACKEND_API_PREFIX}/bootstrap`) {
      writeJson(res, 200, service.bootstrap(installationId))
      log(`[liangbiao-backend] hello ${who(req, installationId)}`)
      return
    }
    if (path === `${BACKEND_API_PREFIX}/me/daily-state`) {
      writeJson(res, 200, service.dailyState(installationId))
      return
    }

    let body: unknown
    try {
      body = rawBody === '' ? {} : (JSON.parse(rawBody) as unknown)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeError(res, 400, 'invalid_request', `invalid request body: ${message}`)
      return
    }

    if (path === `${BACKEND_API_PREFIX}/token-claims`) {
      try {
        const claim = parseV1TokenClaimRequest(body)
        const prior = store.incenseFor(installationId, service.businessDate())
        const priorEarned = prior === undefined
          ? 0
          : Math.floor(prior.claimed_effective_tokens / prior.token_per_incense)
        const response = service.applyTokenClaim(installationId, claim)
        writeJson(res, 200, response)
        const earned = response.authoritative_personal_state.earned_incense
        if (response.claim_applied === true && earned > priorEarned) {
          log(
            `[liangbiao-backend] incense +${earned - priorEarned}炷 ${who(req, installationId)} `
            + `remaining=${response.authoritative_personal_state.remaining_incense} `
            + `tokens=${response.authoritative_personal_state.claimed_effective_tokens}`,
          )
        }
      } catch (error) {
        writeValidationError(res, error)
      }
      return
    }

    // POST /v1/votes
    if (rateLimited(installationId, Date.now())) {
      writeError(res, 429, 'invalid_request', 'too many vote requests; slow down')
      log(`[liangbiao-backend] vote 429 ${who(req, installationId)}`)
      return
    }
    try {
      const intent = parseV1VoteRequest(body)
      const response = service.vote(installationId, intent)
      const status = response.result.status === 'accepted' ? 200 : statusForRejection(response.result.reason)
      writeJson(res, status, response)
      const direction = intent.vote_type === 'up' ? '夯' : '拉'
      const snapshot = response.global_snapshot
      const position = formatLiangPosition(snapshot.up_votes, snapshot.down_votes)
      const remaining = response.authoritative_personal_state.remaining_incense
      if (response.result.status === 'accepted') {
        const replayed = response.result.replayed ? ' replay' : ''
        log(
          `[liangbiao-backend] vote ${direction} accepted${replayed} ${who(req, installationId)} `
          + `remaining=${remaining} 梁位=${position} 香火=${snapshot.total_incense} 香客=${snapshot.unique_voters}`,
        )
      } else {
        log(
          `[liangbiao-backend] vote ${direction} rejected ${response.result.reason} ${who(req, installationId)} `
          + `remaining=${remaining}`,
        )
      }
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
