/**
 * `/v1` HTTP surface over node:http.
 *
 *   GET  /v1/bootstrap       policy + active case + personal state + snapshot
 *   POST /v1/token-claims    record the host's (unverifiable) Token claim
 *   POST /v1/votes           the vote transaction
 *   GET  /v1/snapshot        the published global snapshot
 *   GET  /v1/history         immutable 梁祠 archive (full or version delta)
 *   GET  /v1/me/daily-state  cheap personal refresh
 *   GET  /v1/health          liveness + authority mode + package version + server_build
 *   POST /v1/identity/rekey  self-serve fingerprint takeover (rate-limited)
 *   POST /v1/identity/revoke self-serve delete-own-key (rate-limited)
 *
 * Operator 梁案 / unbind are CLI-only (`node lib/backend-cli.js`). They are
 * not on this HTTP surface — the VPS does not need an operator port.
 *
 * Boundary rules: every body is size-bounded and schema-validated, signed
 * community identity is required unless `allowUnsigned` is on (localhost
 * smoke / legacy tests), votes are rate-limited per installation, and errors
 * are structured `{ error: { code, message } }`. Request logs carry only
 * method/path/status/installation prefix — never a prompt, response, path, or key.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { formatLiangPosition } from '../domain/index.ts'
import { PLUGIN_VERSION, SERVER_BUILD } from '../shared/index.ts'
import { WireError } from '../shared/wire.ts'
import {
  BACKEND_API_PREFIX,
  DEVICE_HEADER,
  INSTALLATION_HEADER,
  PUBLIC_KEY_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  parseInstallationId,
  parseV1AdmissionClaimRequest,
  parseV1TokenClaimRequest,
  parseV1VoteRequest,
  type V1ErrorBody,
  type V1ErrorCode,
} from '../shared/backend-v1.ts'
import { authenticateCommunityRequest, CommunityAuthError } from './community-auth.ts'
import { IdentityRateLimiter, type IdentityRateKind } from './identity-rate-limit.ts'
import { AdmissionRateLimiter } from './admission-rate-limit.ts'
import { DEFAULT_VOTE_RATE_LIMIT_MAX_KEYS, VoteRateLimiter } from './vote-rate-limit.ts'
import type { LiangxiangBackendService } from './service.ts'
import type { BackendStore } from './store.ts'

const MAX_BODY_BYTES = 4096
const EXPECTED_EVENT_SAMPLE_MS = 60_000
export interface BackendHttpOptions {
  service: LiangxiangBackendService
  store: BackendStore
  /** Per-installation vote requests per minute; 0 disables the limit. */
  voteRateLimitPerMinute: number
  /** Hard cap on active installation keys retained by the vote limiter. */
  voteRateLimitMaxKeys?: number
  /** Accept the old unsigned installation header (localhost tests / curl smoke). */
  allowUnsigned?: boolean
  /** Server-wide first-install claims per minute; 0 disables the cap. */
  admissionClaimRateLimitPerMinute?: number
  log?: (message: string) => void
}

export interface BackendHttpApi {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  server: Server
  /** Clear the rate-limit window bookkeeping (dispose/tests). */
  reset: () => void
  /** Test/operations visibility without exposing a public HTTP endpoint. */
  rateLimitState: () => { activeVoteKeys: number, maxVoteKeys: number }
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

function normalizeAddress(raw: string): string {
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw
}

function isLoopbackAddress(address: string): boolean {
  return address === '::1' || address.startsWith('127.')
}

/**
 * Trust the proxy address only across the loopback hop used by Caddy. Direct
 * public callers can forge X-Forwarded-For, so their socket address always
 * wins. Caddy's reverse proxy supplies the immediate client address by
 * default; no public caller can make the backend trust this header directly.
 */
export function trustedClientAddress(socketAddress: string | undefined, forwardedFor?: string): string {
  const direct = normalizeAddress(socketAddress ?? '?')
  if (!isLoopbackAddress(direct) || forwardedFor === undefined || forwardedFor.includes(',')) return direct
  const candidate = normalizeAddress(forwardedFor.trim())
  return isIP(candidate) === 0 ? direct : candidate
}

function peerAddress(req: IncomingMessage): string {
  return trustedClientAddress(req.socket.remoteAddress, headerValue(req, 'x-forwarded-for'))
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

class ExpectedEventSampler {
  private readonly buckets = new Map<string, { at: number, suppressed: number }>()

  constructor(private readonly sink: (message: string) => void) {}

  record(key: string, message: string, now = Date.now()): void {
    const bucket = this.buckets.get(key)
    if (bucket !== undefined && now - bucket.at < EXPECTED_EVENT_SAMPLE_MS) {
      bucket.suppressed += 1
      return
    }
    if (bucket !== undefined && bucket.suppressed > 0) {
      this.sink(`[liangxiang-backend] ${key} suppressed=${bucket.suppressed} in previous window`)
    }
    this.buckets.set(key, { at: now, suppressed: 0 })
    this.sink(message)
  }

  reset(): void {
    this.buckets.clear()
  }
}

export function createBackendHttpApi(options: BackendHttpOptions): BackendHttpApi {
  const { service, store, voteRateLimitPerMinute } = options
  const allowUnsigned = options.allowUnsigned === true
  const log = options.log ?? ((message: string) => console.log(message))
  const voteRateLimitMaxKeys = options.voteRateLimitMaxKeys ?? DEFAULT_VOTE_RATE_LIMIT_MAX_KEYS
  const voteLimiter = new VoteRateLimiter(voteRateLimitPerMinute, voteRateLimitMaxKeys)
  const identityLimiter = new IdentityRateLimiter()
  const admissionLimiter = new AdmissionRateLimiter(options.admissionClaimRateLimitPerMinute ?? 120)
  const expectedEvents = new ExpectedEventSampler(log)

  const authenticate = (req: IncomingMessage, method: string, path: string, rawBody: string): string => {
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
    authenticateCommunityRequest({
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
      skipFingerprintEnforcement: true,
    })
    const known = store.identityByInstallation(installationId)
    if (known === undefined) {
      throw new CommunityAuthError(401, 'admission_required', '需要入梁券完成首次入群')
    }
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

  /**
   * Authenticate a re-key intent WITHOUT enforcing the fingerprint binding —
   * the re-key endpoint's whole job is to (re)bind that fingerprint to the new
   * key. Still verifies the signature, the timestamp, and that the installation
   * id derives from the presented public key.
   */
  const authenticateRekey = (req: IncomingMessage, method: string, path: string, rawBody: string): {
    installationId: string
    publicKey: string
    deviceFingerprint: string
  } => {
    const publicKey = headerValue(req, PUBLIC_KEY_HEADER)
    const signature = headerValue(req, SIGNATURE_HEADER)
    const timestamp = headerValue(req, TIMESTAMP_HEADER)
    if (publicKey === undefined || signature === undefined || timestamp === undefined) {
      throw new CommunityAuthError(401, 'invalid_signature', 'signed identity headers required')
    }
    const installationId = parseInstallationId(headerValue(req, INSTALLATION_HEADER))
    const deviceFingerprint = headerValue(req, DEVICE_HEADER) ?? ''
    if (deviceFingerprint === '') {
      throw new CommunityAuthError(400, 'invalid_request', 'a device fingerprint header is required to re-key')
    }
    authenticateCommunityRequest({
      store,
      method,
      path,
      body: rawBody,
      installationId,
      publicKey,
      signature,
      timestamp,
      deviceFingerprint,
      now: Date.now(),
      skipFingerprintEnforcement: true,
    })
    return { installationId, publicKey, deviceFingerprint }
  }

  const identityKind = (
    publicKey: string,
    installationId: string,
    fingerprint: string | null,
  ): IdentityRateKind => {
    if (store.identityByInstallation(installationId) !== undefined) return 'hit'
    if (store.identityByPublicKey(publicKey) !== undefined) return 'hit'
    if (fingerprint !== null && fingerprint !== '' && store.identityByFingerprint(fingerprint) !== undefined) {
      return 'hit'
    }
    return 'miss'
  }

  const gateIdentityMutation = (
    req: IncomingMessage,
    res: ServerResponse,
    publicKey: string,
    installationId: string,
    fingerprint: string | null,
    action: string,
  ): boolean => {
    const ip = peerAddress(req)
    const kind = identityKind(publicKey, installationId, fingerprint)
    const decision = identityLimiter.check(Date.now(), ip, installationId, kind)
    const whoLabel = `${installShort(installationId)} ip=${ip} kind=${kind}`
    if (!decision.allowed) {
      const seconds = Math.ceil(decision.retryAfterMs / 1000)
      expectedEvents.record(
        `identity_${action}_rate_limited_${kind}`,
        `[liangxiang-backend] ${action} rate-limited ${whoLabel} retry=${seconds}s`,
      )
      writeError(
        res,
        429,
        'identity_rate_limited',
        kind === 'miss'
          ? `unrecognized key; wait ${seconds}s before retrying`
          : `identity update already used; wait ${seconds}s`,
      )
      return false
    }
    log(`[liangxiang-backend] ${action} allowed ${whoLabel}`)
    return true
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://liangxiang.backend')
    const path = url.pathname
    const method = req.method ?? 'GET'
    const routes: Record<string, string> = {
      [`${BACKEND_API_PREFIX}/health`]: 'GET',
      [`${BACKEND_API_PREFIX}/admission/tickets`]: 'GET',
      [`${BACKEND_API_PREFIX}/admission/claim`]: 'POST',
      [`${BACKEND_API_PREFIX}/bootstrap`]: 'GET',
      [`${BACKEND_API_PREFIX}/snapshot`]: 'GET',
      [`${BACKEND_API_PREFIX}/history`]: 'GET',
      [`${BACKEND_API_PREFIX}/me/daily-state`]: 'GET',
      [`${BACKEND_API_PREFIX}/token-claims`]: 'POST',
      [`${BACKEND_API_PREFIX}/votes`]: 'POST',
      [`${BACKEND_API_PREFIX}/identity/rekey`]: 'POST',
      [`${BACKEND_API_PREFIX}/identity/revoke`]: 'POST',
    }
    const expected = routes[path]
    if (expected === undefined) {
      writeError(res, 404, 'unknown_route', `unknown route ${path}`)
      return
    }
    const allowed = expected.split(',')
    if (!allowed.includes(method)) {
      writeError(res, 405, 'method_not_allowed', `method ${method} not allowed for ${path}`)
      return
    }

    if (path === `${BACKEND_API_PREFIX}/health`) {
      writeJson(res, 200, {
        status: 'ok',
        authority_mode: service.authorityMode,
        business_date: service.businessDate(),
        version: PLUGIN_VERSION,
        server_build: SERVER_BUILD,
      })
      return
    }
    if (path === `${BACKEND_API_PREFIX}/snapshot`) {
      // Public read: no installation identity involved.
      writeJson(res, 200, service.snapshotResponse())
      return
    }
    if (path === `${BACKEND_API_PREFIX}/admission/tickets`) {
      // Public ticket list is the one-tap 入梁券 design: the secret is meant
      // to be claimed, not a leaked credential. Rate limits bound inventory.
      writeJson(res, 200, service.admissionTickets())
      return
    }
    if (path === `${BACKEND_API_PREFIX}/history`) {
      // Public read, separate from the hot snapshot channel. A client requests
      // the full archive once, then only rows newer than its immutable cursor.
      try {
        const unknown = [...url.searchParams.keys()].filter(key => key !== 'after_version')
        if (unknown.length > 0) throw new WireError(unknown[0] as string, 'unknown history query parameter')
        const values = url.searchParams.getAll('after_version')
        if (values.length > 1) throw new WireError('after_version', 'must appear at most once')
        let afterVersion: number | undefined
        if (values.length === 1) {
          const raw = values[0] as string
          if (!/^\d+$/.test(raw)) throw new WireError('after_version', 'expected a non-negative integer')
          afterVersion = Number(raw)
          if (!Number.isSafeInteger(afterVersion)) throw new WireError('after_version', 'exceeds safe integer range')
        }
        writeJson(res, 200, service.historyResponse(afterVersion))
      } catch (error) {
        writeValidationError(res, error)
      }
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
        writeError(res, 400, 'invalid_request', 'invalid request')
        return
      }
    }

    if (path === `${BACKEND_API_PREFIX}/identity/rekey`) {
      try {
        const { installationId, publicKey, deviceFingerprint } = authenticateRekey(req, method, path, rawBody)
        if (!gateIdentityMutation(req, res, publicKey, installationId, deviceFingerprint, 'rekey')) {
          return
        }
        if (store.identityByFingerprint(deviceFingerprint) === undefined) {
          throw new CommunityAuthError(401, 'admission_required', '新设备需要先使用入梁券')
        }
        const response = service.rekeyIdentity(installationId, publicKey, deviceFingerprint)
        writeJson(res, 200, response)
        if (response.rekeyed) {
          log(
            `[liangxiang-backend] rekey ${installShort(response.previous_installation_id ?? '')} `
            + `-> ${installShort(installationId)} ip=${peerAddress(req)}`,
          )
        }
      } catch (error) {
        if (error instanceof CommunityAuthError) {
          writeError(res, error.httpStatus, error.code, error.message)
          return
        }
        writeValidationError(res, error)
      }
      return
    }

    if (path === `${BACKEND_API_PREFIX}/admission/claim`) {
      try {
        const publicKey = headerValue(req, PUBLIC_KEY_HEADER)
        const signature = headerValue(req, SIGNATURE_HEADER)
        const timestamp = headerValue(req, TIMESTAMP_HEADER)
        if (publicKey === undefined || signature === undefined || timestamp === undefined) {
          throw new CommunityAuthError(401, 'invalid_signature', 'signed identity headers required')
        }
        const installationId = parseInstallationId(headerValue(req, INSTALLATION_HEADER))
        const deviceFingerprint = headerValue(req, DEVICE_HEADER) ?? ''
        if (deviceFingerprint === '') {
          throw new CommunityAuthError(400, 'invalid_request', 'a device fingerprint header is required for admission')
        }
        authenticateCommunityRequest({
          store,
          method,
          path,
          body: rawBody,
          installationId,
          publicKey,
          signature,
          timestamp,
          deviceFingerprint,
          now: Date.now(),
          skipFingerprintEnforcement: true,
        })
        const body = parseV1AdmissionClaimRequest(JSON.parse(rawBody) as unknown)
        if (body.public_key !== publicKey || body.device_fingerprint !== deviceFingerprint) {
          throw new CommunityAuthError(400, 'invalid_request', 'signed headers do not match admission body')
        }
        const decision = admissionLimiter.check(Date.now())
        if (!decision.allowed) {
          const seconds = Math.ceil(decision.retryAfterMs / 1000)
          throw new CommunityAuthError(429, 'admission_rate_limited', `入梁暂忙，请在 ${seconds} 秒后重试`)
        }
        const response = service.claimAdmission(
          installationId,
          publicKey,
          deviceFingerprint,
          body.ticket_secret,
        )
        writeJson(res, 200, response)
        log(
          `[liangxiang-backend] admission claimed=${String(response.claimed)} `
          + `${who(req, installationId)} ticket=${response.ticket_id ?? 'existing'}`,
        )
      } catch (error) {
        if (error instanceof CommunityAuthError) {
          writeError(res, error.httpStatus, error.code, error.message)
          return
        }
        writeValidationError(res, error)
      }
      return
    }

    if (path === `${BACKEND_API_PREFIX}/identity/revoke`) {
      try {
        const publicKey = headerValue(req, PUBLIC_KEY_HEADER)
        const signature = headerValue(req, SIGNATURE_HEADER)
        const timestamp = headerValue(req, TIMESTAMP_HEADER)
        if (publicKey === undefined || signature === undefined || timestamp === undefined) {
          throw new CommunityAuthError(401, 'invalid_signature', 'signed identity headers required')
        }
        const installationId = parseInstallationId(headerValue(req, INSTALLATION_HEADER))
        const device = headerValue(req, DEVICE_HEADER) ?? null
        authenticateCommunityRequest({
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
          skipFingerprintEnforcement: true,
        })
        if (!gateIdentityMutation(req, res, publicKey, installationId, device, 'revoke')) {
          return
        }
        if (store.identityByInstallation(installationId) === undefined) {
          throw new CommunityAuthError(401, 'admission_required', 'identity is not enrolled')
        }
        const response = service.revokeIdentity(installationId)
        writeJson(res, 200, response)
        log(
          `[liangxiang-backend] revoke ${installShort(installationId)} `
          + `unbound=${String(response.unbound)} ip=${peerAddress(req)}`,
        )
      } catch (error) {
        if (error instanceof CommunityAuthError) {
          writeError(res, error.httpStatus, error.code, error.message)
          return
        }
        writeValidationError(res, error)
      }
      return
    }

    let installationId: string
    try {
      installationId = authenticate(req, method, path, rawBody)
    } catch (error) {
      if (error instanceof CommunityAuthError) {
        writeError(res, error.httpStatus, error.code, error.message)
        const install = headerValue(req, INSTALLATION_HEADER)
        if (install !== undefined) {
          expectedEvents.record(
            `auth_deny_${error.code}`,
            `[liangxiang-backend] deny ${error.httpStatus} ${error.code} `
            + `${who(req, install)} ${method} ${path}`,
          )
        }
        return
      }
      if (error instanceof WireError) {
        writeError(res, 401, 'missing_installation', `installation header invalid: ${error.message}`, error.field)
        return
      }
      writeError(res, 401, 'missing_installation', 'installation header invalid', INSTALLATION_HEADER)
      return
    }

    if (path === `${BACKEND_API_PREFIX}/bootstrap`) {
      writeJson(res, 200, service.bootstrap(installationId))
      expectedEvents.record('bootstrap_hello', `[liangxiang-backend] hello ${who(req, installationId)}`)
      return
    }
    if (path === `${BACKEND_API_PREFIX}/me/daily-state`) {
      writeJson(res, 200, service.dailyState(installationId))
      return
    }

    let body: unknown
    try {
      body = rawBody === '' ? {} : (JSON.parse(rawBody) as unknown)
    } catch {
      writeError(res, 400, 'invalid_request', 'invalid request')
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
        const have = response.authoritative_personal_state.claimed_effective_tokens
        if (response.claim_applied === true && earned > priorEarned) {
          log(
            `[liangxiang-backend] incense +${earned - priorEarned}炷 ${who(req, installationId)} `
            + `remaining=${response.authoritative_personal_state.remaining_incense} `
            + `tokens=${have}`,
          )
        } else if (response.claim_applied !== true) {
          if (claim.claim_business_date !== response.business_date) {
            expectedEvents.record(
              'claim_wrong_date',
              `[liangxiang-backend] claim ignored wrong_date ${who(req, installationId)} `
              + `requested_date=${claim.claim_business_date} have_date=${response.business_date}`,
            )
          } else {
            expectedEvents.record(
              'claim_below_watermark',
              `[liangxiang-backend] claim ignored below_watermark ${who(req, installationId)} `
              + `requested=${claim.claimed_effective_tokens} have=${have}`,
            )
          }
        }
      } catch (error) {
        writeValidationError(res, error)
      }
      return
    }

    // POST /v1/votes — parse first so a dump's `count` is known before the bucket.
    // Business time stays on the service clock (test fixtures freeze it);
    // the limiter uses wall time. Replays must not be 429'd by an empty bucket.
    try {
      const intent = parseV1VoteRequest(body)
      const limiterNow = Date.now()
      const lastVoteAt = store.lastAcceptedVoteAt(installationId)
      // Every valid business result (accepted or rejected) has a durable
      // receipt. Replays bypass the live rate bucket and return that receipt;
      // a conflicting payload is rejected by the service.
      const existing = store.voteRequestByRequestId(installationId, intent.request_id)
      let available = Number.POSITIVE_INFINITY
      if (existing === undefined) {
        const decision = voteLimiter.inspect(installationId, limiterNow, lastVoteAt)
        if (!decision.allowed || decision.available <= 0) {
          const message = decision.reason === 'active_key_capacity'
            ? 'server vote limiter is at active-key capacity; retry later'
            : 'too many vote requests; slow down'
          writeError(res, 429, 'vote_rate_limited', message)
          expectedEvents.record(
            `vote_rate_limited_${decision.reason ?? 'unknown'}`,
            `[liangxiang-backend] vote 429 reason=${decision.reason ?? 'unknown'} ${who(req, installationId)}`,
          )
          return
        }
        available = decision.available
      }
      const response = service.vote(installationId, intent, undefined, available)
      if (response.result.status === 'accepted' && !response.result.replayed) {
        const spent = response.result.spent_incense ?? 1
        if (spent > 0) voteLimiter.consume(installationId, spent, limiterNow, lastVoteAt)
      } else if (existing === undefined && response.result.status === 'rejected') {
        // A new service-level rejection now creates a durable SQLite receipt.
        // Charge one admission unit so distinct rejected request IDs cannot
        // grow that table without bound. Stored replays/conflicts bypass this
        // branch and remain available even while the live bucket is empty.
        voteLimiter.consume(installationId, 1, limiterNow, lastVoteAt)
      }
      const status = response.result.status === 'accepted' ? 200 : statusForRejection(response.result.reason)
      writeJson(res, status, response)
      const direction = intent.vote_type === 'up' ? '夯' : '拉'
      const snapshot = response.global_snapshot
      const position = formatLiangPosition(snapshot.up_votes, snapshot.down_votes)
      const remaining = response.authoritative_personal_state.remaining_incense
      if (response.result.status === 'accepted') {
        const spent = response.result.spent_incense ?? 1
        const message = `[liangxiang-backend] vote ${direction} accepted ${who(req, installationId)} `
          + `spent=${spent} remaining=${remaining} 梁位=${position} 香火=${snapshot.total_incense} 香客=${snapshot.unique_voters}`
        if (response.result.replayed) expectedEvents.record('vote_replay', `${message} replay=true`)
        else log(message)
      } else {
        expectedEvents.record(
          `vote_rejected_${response.result.reason}`,
          `[liangxiang-backend] vote ${direction} rejected ${response.result.reason} ${who(req, installationId)} `
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
      log(`[liangxiang-backend] unhandled request failure: ${message}`)
      if (!res.headersSent) writeError(res, 500, 'internal_error', 'internal error')
      else res.end()
    })
  })

  return {
    handler,
    server,
    reset: () => {
      voteLimiter.reset()
      identityLimiter.reset()
      admissionLimiter.reset()
      expectedEvents.reset()
    },
    rateLimitState: () => ({
      activeVoteKeys: voteLimiter.activeKeys,
      maxVoteKeys: voteRateLimitMaxKeys,
    }),
  }
}

function writeValidationError(res: ServerResponse, error: unknown): void {
  if (error instanceof WireError) {
    writeError(res, 400, 'invalid_request', error.message, error.field)
    return
  }
  if (error instanceof SyntaxError) {
    writeError(res, 400, 'invalid_request', 'invalid request')
    return
  }
  throw error
}
