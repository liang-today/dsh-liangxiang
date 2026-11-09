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
import { randomUUID } from 'node:crypto'
import { MARKET_CANDLE_INTERVAL_MS, parseMarketCandleInterval, parseMarketPositionRequest, type MarketStreamEvent, type MarketState } from '../shared/market-v1.ts'
import { legacyLiangziView, legacyLiangziHistory } from './liangzi-compat.ts'
import { LegacyWalletUpgradeRequiredError, WALLET_MIN_CLIENT_VERSION, legacyWalletView } from './legacy-wallet.ts'
import { LIANGZI_POLICY_VERSION } from '../domain/index.ts'
import { formatLiangPosition } from '../domain/index.ts'
import { PLUGIN_VERSION, SERVER_BUILD } from '../shared/index.ts'
import { WireError } from '../shared/wire.ts'
import {
  BACKEND_API_PREFIX,
  DEVICE_HEADER,
  INSTALLATION_HEADER,
  LIANGZI_POLICY_HEADER,
  WALLET_CAPABILITY_HEADER,
  WALLET_CAPABILITY_VERSION,
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
  /** Dependency injection for private accelerated rehearsals; ordinary deployments use wall time. */
  voteClock?: { now(): number }
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
  const marketLimiter = new VoteRateLimiter(60, voteRateLimitMaxKeys)
  const identityLimiter = new IdentityRateLimiter()
  const admissionLimiter = new AdmissionRateLimiter(options.admissionClaimRateLimitPerMinute ?? 120)
  const expectedEvents = new ExpectedEventSampler(log)
  const epoch = randomUUID()
  interface Stream {
    installation: string
    res: ServerResponse
    revision: number
    global: string
    personal: string
    heartbeat: number
    blockedAt: number | null
    state?: MarketState
  }
  const streams = new Set<Stream>()
  let streamTimer: ReturnType<typeof setInterval> | undefined
  let fanout: ReturnType<typeof setImmediate> | undefined
  let pumping = false
  let shared: ReturnType<typeof captureFrame> | undefined
  function captureFrame() {
    const snapshot = service.snapshotResponse()
    const candle = service.marketCurrentCandle()
    return { at: Date.now(), snapshot, candle,
      global: JSON.stringify({ snapshot: { ...snapshot, server_time: 0 }, candle }),
      marketVersion: service.marketGlobalStreamVersion(),
      state: service.prepareMarketStreamFrame(snapshot.server_time) }
  }
  const closeStream = (stream: Stream, destroy = false): void => {
    if (!streams.delete(stream)) return
    if (destroy) stream.res.destroy()
    else stream.res.end()
    if (streams.size === 0) {
      if (streamTimer !== undefined) clearInterval(streamTimer)
      streamTimer = undefined
      if (fanout !== undefined) clearImmediate(fanout)
      fanout = undefined
      pumping = false
      shared = undefined
    }
  }
  const sendStream = (stream: Stream, frame: ReturnType<typeof captureFrame>, initial?: MarketState): void => {
    try {
      if (!streams.has(stream)) return
      if (!allowUnsigned && store.identityByInstallation(stream.installation) === undefined) {
        closeStream(stream, true)
        return
      }
      const now = Date.now()
      if (stream.res.destroyed || stream.res.writableLength > 65_536
        || (stream.blockedAt !== null && now - stream.blockedAt >= 25_000)) {
        closeStream(stream, true)
        return
      }
      // A false write buffers the frame; it is not itself a disconnect.
      // Keep at most the written frame and coalesce subsequent state until drain.
      if (stream.blockedAt !== null) return
      const walletVersion = initial?.wallet.version ?? service.marketWalletVersion(stream.installation)
      const personal = `${frame.marketVersion}:${walletVersion}`
      const event: MarketStreamEvent = { schema_version: 1, epoch, revision: stream.revision + 1,
        server_time: frame.snapshot.server_time }
      if (stream.global !== frame.global) {
        event.snapshot = frame.snapshot
        if (frame.candle !== undefined) { event.candle = frame.candle; event.candle_interval_ms = MARKET_CANDLE_INTERVAL_MS }
      }
      if (stream.personal !== personal) event.market_state = initial ?? frame.state(stream.installation, stream.state)
      if (event.snapshot !== undefined || event.market_state !== undefined) {
        const text = `id: ${epoch}:${event.revision}\nevent: state\ndata: ${JSON.stringify(event)}\n\n`
        if (!stream.res.write(text)) stream.blockedAt = now
        stream.revision = event.revision
        stream.global = frame.global
        stream.personal = `${frame.marketVersion}:${event.market_state?.wallet.version ?? walletVersion}`
        if (event.market_state !== undefined) stream.state = event.market_state
        stream.heartbeat = now
      } else if (now - stream.heartbeat >= 25_000) {
        if (!stream.res.write(': heartbeat\n\n')) stream.blockedAt = now
        stream.heartbeat = now
      }
    } catch {
      closeStream(stream, true)
    }
  }
  const pumpStreams = (): void => {
    if (streams.size === 0 || pumping) return
    try {
      let frame = captureFrame()
      shared = frame
      const pending = [...streams][Symbol.iterator]()
      pumping = true
      const chunk = (): void => {
        fanout = undefined
        // A midnight or operator replacement may occur while we yield. Never
        // resume a captured old-case frame against the new case's private data.
        try {
          const date = service.businessDate()
          if (date !== frame.snapshot.business_date || store.activeCaseFor(date)?.id !== frame.snapshot.active_case.id) {
            frame = captureFrame()
            shared = frame
          }
        } catch {
          pumping = false
          for (const stream of streams) closeStream(stream, true)
          return
        }
        // Yield between bounded chunks so new connections and signed actions
        // are accepted while broadcasting. Never queue a second whole fanout.
        for (let n = 0; n < 64; n += 1) {
          const next = pending.next()
          if (next.done) { pumping = false; return }
          sendStream(next.value, frame)
        }
        if (streams.size === 0) { pumping = false; return }
        fanout = setImmediate(chunk)
        fanout.unref?.()
      }
      chunk()
    } catch {
      pumping = false
      for (const stream of streams) closeStream(stream)
    }
  }

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
    const known = store.identityByInstallation(installationId)
    authenticateCommunityRequest({
      store, method, path, body: rawBody, installationId, publicKey, signature,
      timestamp, deviceFingerprint: device, now: Date.now(),
      // Unknown installations still prove their signature before admission is
      // rejected; they must never be auto-enrolled by ordinary API requests.
      skipFingerprintEnforcement: known === undefined,
      knownIdentity: known ?? null,
    })
    if (known === undefined) {
      throw new CommunityAuthError(401, 'admission_required', '需要入梁券完成首次入群')
    }
    return installationId
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
      [`${BACKEND_API_PREFIX}/market`]: 'GET',
      [`${BACKEND_API_PREFIX}/market/position`]: 'POST',
      [`${BACKEND_API_PREFIX}/market/candles`]: 'GET',
      [`${BACKEND_API_PREFIX}/market/history`]: 'GET',
      [`${BACKEND_API_PREFIX}/events`]: 'GET',
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
      writeJson(res, 200, headerValue(req, LIANGZI_POLICY_HEADER) === LIANGZI_POLICY_VERSION ? service.snapshotResponse() : legacyLiangziView(service.snapshotResponse()))
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
        const history = service.historyResponse(afterVersion)
        writeJson(res, 200, headerValue(req, LIANGZI_POLICY_HEADER) === LIANGZI_POLICY_VERSION ? history : legacyLiangziHistory(history))
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
      installationId = authenticate(req, method, `${path}${url.search}`, rawBody)
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

    if ((path === `${BACKEND_API_PREFIX}/events` || path.startsWith(`${BACKEND_API_PREFIX}/market/`)
      || path === `${BACKEND_API_PREFIX}/market`)
      && headerValue(req, WALLET_CAPABILITY_HEADER) !== WALLET_CAPABILITY_VERSION) {
      writeValidationError(res, new LegacyWalletUpgradeRequiredError())
      return
    }

    if (path === `${BACKEND_API_PREFIX}/bootstrap`) {
      try {
        const response = service.bootstrap(installationId, undefined, headerValue(req, WALLET_CAPABILITY_HEADER) === WALLET_CAPABILITY_VERSION)
        const bootstrap = headerValue(req, WALLET_CAPABILITY_HEADER) === WALLET_CAPABILITY_VERSION ? response : legacyWalletView(response)
        writeJson(res, 200, headerValue(req, LIANGZI_POLICY_HEADER) === LIANGZI_POLICY_VERSION ? bootstrap : legacyLiangziView(bootstrap))
      } catch (error) { writeValidationError(res, error) }
      expectedEvents.record('bootstrap_hello', `[liangxiang-backend] hello ${who(req, installationId)}`)
      return
    }
    if (path === `${BACKEND_API_PREFIX}/me/daily-state`) {
      try {
        const response = service.dailyState(installationId, undefined, headerValue(req, WALLET_CAPABILITY_HEADER) === WALLET_CAPABILITY_VERSION)
        writeJson(res, 200, headerValue(req, WALLET_CAPABILITY_HEADER) === WALLET_CAPABILITY_VERSION ? response : legacyWalletView(response))
      } catch (error) { writeValidationError(res, error) }
      return
    }
    if (path === `${BACKEND_API_PREFIX}/events`) {
      if (url.search !== '') {
        writeError(res, 400, 'invalid_request', 'event stream does not accept query parameters')
        return
      }
      if (streams.size >= 2_000 || [...streams].filter(s => s.installation === installationId).length >= 3) {
        writeError(res, 429, 'identity_rate_limited', 'event stream connection capacity reached')
        return
      }
      // Bootstrap before sending headers so identity/storage failures stay ordinary HTTP errors.
      const initial = service.marketState(installationId)
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' })
      res.flushHeaders()
      const stream: Stream = { installation: installationId, res, revision: 0, global: '', personal: '', heartbeat: Date.now(), blockedAt: null }
      streams.add(stream)
      res.once('close', () => closeStream(stream))
      res.on('drain', () => { stream.blockedAt = null })
      // Initial state targets only the new subscriber, not every existing one.
      if (shared === undefined || Date.now() - shared.at >= 1_000
        || initial.server_time - shared.snapshot.server_time >= 1_000
        || shared.snapshot.active_case.id !== initial.market?.case_id) shared = captureFrame()
      sendStream(stream, shared, initial)
      if (streamTimer === undefined && streams.size > 0) {
        streamTimer = setInterval(pumpStreams, 1_000)
        streamTimer.unref?.()
      }
      return
    }
    if (path === `${BACKEND_API_PREFIX}/market`) {
      if (url.search !== '') {
        writeError(res, 400, 'invalid_request', 'market state does not accept query parameters')
        return
      }
      writeJson(res, 200, service.marketState(installationId))
      return
    }
    if (path === `${BACKEND_API_PREFIX}/market/history` || path === `${BACKEND_API_PREFIX}/market/candles`) {
      try {
        const allowed = path.endsWith('/history') ? ['cursor', 'limit'] : ['cursor', 'limit', 'business_date', 'case_id', 'interval_ms']
        for (const key of url.searchParams.keys()) {
          if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new WireError('query', 'unknown or repeated market query parameter')
        }
        const limitRaw = url.searchParams.get('limit')
        if (limitRaw !== null && !/^\d{1,3}$/.test(limitRaw)) throw new WireError('limit', 'expected an integer page limit')
        const cursor = url.searchParams.get('cursor') ?? undefined
        const limit = limitRaw === null ? undefined : Number(limitRaw)
        if (url.searchParams.has('interval_ms') && !/^(60000|300000)$/.test(url.searchParams.get('interval_ms')!)) throw new WireError('interval_ms', 'unsupported candle interval')
        if (path.endsWith('/history')) writeJson(res, 200, service.marketHistory(installationId, cursor, limit))
        else writeJson(res, 200, service.marketCandles({
          ...(cursor === undefined ? {} : { cursor }), ...(limit === undefined ? {} : { limit }),
          ...(url.searchParams.has('case_id') ? { caseId: url.searchParams.get('case_id')! } : {}),
          ...(url.searchParams.has('business_date') ? { businessDate: url.searchParams.get('business_date')! } : {}),
          ...(url.searchParams.has('interval_ms') ? { interval_ms: parseMarketCandleInterval(Number(url.searchParams.get('interval_ms'))) } : {}),
        }))
      } catch (error) { writeValidationError(res, error) }
      return
    }

    let body: unknown
    try {
      body = rawBody === '' ? {} : (JSON.parse(rawBody) as unknown)
    } catch {
      writeError(res, 400, 'invalid_request', 'invalid request')
      return
    }

    if (path === `${BACKEND_API_PREFIX}/market/position`) {
      let intent: ReturnType<typeof parseMarketPositionRequest>
      try { intent = parseMarketPositionRequest(body) }
      catch (error) {
        writeError(res, 400, 'invalid_request', error instanceof Error ? error.message : 'invalid position intent')
        return
      }
      try {
        const stored = store.database.prepare('SELECT 1 FROM liang_market_request WHERE installation_id=? AND request_id=?')
          .get(installationId, intent.request_id)
        if (stored === undefined) {
          const decision = marketLimiter.inspect(installationId, Date.now(), null)
          if (!decision.allowed || decision.available < 1) {
            writeError(res, 429, 'identity_rate_limited', 'too many position updates; retry later')
            return
          }
          marketLimiter.consume(installationId, 1, Date.now(), null)
        }
        writeJson(res, 200, service.setMarketPosition(installationId, intent))
      }
      catch (error) { writeValidationError(res, error) }
      return
    }

    if (path === `${BACKEND_API_PREFIX}/token-claims`) {
      try {
        const claim = parseV1TokenClaimRequest(body)
        const prior = store.incenseFor(installationId, service.businessDate())
        const priorEarned = prior === undefined
          ? 0
          : Math.floor(prior.claimed_effective_tokens / prior.token_per_incense)
        const response = service.applyTokenClaim(installationId, claim, undefined, headerValue(req, WALLET_CAPABILITY_HEADER) === WALLET_CAPABILITY_VERSION)
        writeJson(res, 200, headerValue(req, WALLET_CAPABILITY_HEADER) === WALLET_CAPABILITY_VERSION ? response : legacyWalletView(response))
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
    // the limiter defaults to wall time. Private rehearsals inject the same clock
    // as their persisted vote timestamps. Auth always retains real wall time.
    // Replays must not be 429'd by an empty bucket.
    try {
      const intent = parseV1VoteRequest(body)
      const limiterNow = options.voteClock?.now() ?? Date.now()
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
      const response = service.vote(installationId, intent, undefined, available,
        headerValue(req, WALLET_CAPABILITY_HEADER) !== WALLET_CAPABILITY_VERSION)
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
      const view = headerValue(req, WALLET_CAPABILITY_HEADER) === WALLET_CAPABILITY_VERSION ? response : legacyWalletView(response)
      writeJson(res, status, headerValue(req, LIANGZI_POLICY_HEADER) === LIANGZI_POLICY_VERSION ? view : legacyLiangziView(view))
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
  // Keep upstream HTTP sockets reusable across ordinary user think time.
  // An explicit header deadline still bounds slow/incomplete requests.
  server.keepAliveTimeout = 65_000
  const closeServer = server.close.bind(server)
  server.close = (callback) => {
    for (const stream of streams) closeStream(stream)
    return closeServer(callback)
  }

  return {
    handler,
    server,
    reset: () => {
      for (const stream of streams) closeStream(stream)
      voteLimiter.reset()
      marketLimiter.reset()
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
  if (error instanceof LegacyWalletUpgradeRequiredError) {
    // Old vote clients treat every 409 as a complete business receipt. A
    // capability precondition uses 412 so they retain the actual error code.
    writeJson(res, 412, { error: { code: 'wallet_upgrade_required', message: error.message,
      min_client_version: WALLET_MIN_CLIENT_VERSION } })
    return
  }
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
