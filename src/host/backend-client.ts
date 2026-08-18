/**
 * HTTP client for the Liangxiang backend `/v1` API.
 *
 * Posture:
 *  - every request is timeout-bounded and abortable; `dispose()` cancels
 *    everything in flight (plugin unload / HMR must not leak sockets);
 *  - reads (bootstrap / snapshot / daily-state / history) get one bounded retry;
 *  - a vote is NEVER retried here — retrying a vote is the caller's decision and
 *    must reuse the same `request_id` (AGENTS.md §15);
 *  - a 409 vote response is a business outcome, not a transport failure: it is
 *    parsed and returned like a 200;
 *  - every response passes the `/v1` validators before it is trusted.
 */
import {
  BACKEND_API_PREFIX,
  DEVICE_HEADER,
  INSTALLATION_HEADER,
  PUBLIC_KEY_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  completeV1VoteResponse,
  isMissingVoteSnapshotError,
  parseV1AdmissionClaimResponse,
  parseV1AdmissionTicketsResponse,
  parseV1Bootstrap,
  parseV1PersonalStateResponse,
  parseV1RekeyResponse,
  parseV1SnapshotResponse,
  parseV1VoteEnvelope,
  parseV1VoteResponse,
  type V1Bootstrap,
  type V1AdmissionClaimResponse,
  type V1AdmissionTicketsResponse,
  type V1PersonalStateResponse,
  type V1RekeyResponse,
  type V1SnapshotResponse,
  type V1VoteRequest,
  type V1VoteResponse,
} from '../shared/backend-v1.ts'
import { signRequest, type CommunityKeypair } from './community-keys.ts'
import { parseV1HistoryResponse, type ParsedHistoryArchive } from '../shared/history-v1.ts'

const DEFAULT_TIMEOUT_MS = 6_000
const READ_RETRY_DELAY_MS = 300

export class BackendClientError extends Error {
  readonly status: number | null
  readonly code: string | null

  constructor(message: string, status: number | null = null, code: string | null = null) {
    super(message)
    this.name = 'BackendClientError'
    this.status = status
    this.code = code
  }
}

export interface BackendClientOptions {
  baseUrl: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Live community keypair; null until the Host has minted/loaded identity. */
  signer?: () => CommunityKeypair | null
}

export interface BackendClient {
  readonly baseUrl: string
  bootstrap: (installationId: string) => Promise<V1Bootstrap>
  admissionTickets: () => Promise<V1AdmissionTicketsResponse>
  claimAdmission: (
    installationId: string,
    ticketSecret: string,
    publicKey: string,
    deviceFingerprint: string,
  ) => Promise<V1AdmissionClaimResponse>
  rekeyIdentity: (installationId: string) => Promise<V1RekeyResponse>
  submitClaim: (
    installationId: string,
    claimedEffectiveTokens: number,
    claimBusinessDate: string,
  ) => Promise<V1PersonalStateResponse>
  dailyState: (installationId: string) => Promise<V1PersonalStateResponse>
  snapshot: () => Promise<V1SnapshotResponse>
  history: (afterVersion?: number) => Promise<ParsedHistoryArchive>
  vote: (installationId: string, intent: V1VoteRequest) => Promise<V1VoteResponse>
  dispose: () => void
}

/** Normalize a configured base URL (`http://127.0.0.1:4180`, no trailing slash). */
export function normalizeBaseUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BackendClientError(`unsupported backend protocol ${url.protocol}`)
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export function createBackendClient(options: BackendClientOptions): BackendClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const doFetch = options.fetchImpl ?? fetch
  const inFlight = new Set<AbortController>()
  let disposed = false

  const request = async (
    path: string,
    init: { method: 'GET' | 'POST', installationId?: string, body?: unknown, acceptStatus?: (status: number) => boolean },
  ): Promise<unknown> => {
    if (disposed) throw new BackendClientError('backend client disposed')
    const controller = new AbortController()
    inFlight.add(controller)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const rawBody = init.body === undefined ? '' : JSON.stringify(init.body)
      const headers: Record<string, string> = {}
      if (init.installationId !== undefined) headers[INSTALLATION_HEADER] = init.installationId
      if (init.body !== undefined) headers['content-type'] = 'application/json'
      const identity = options.signer?.() ?? null
      if (identity !== null && init.installationId !== undefined) {
        const timestamp = Date.now()
        headers[PUBLIC_KEY_HEADER] = identity.publicKey
        headers[TIMESTAMP_HEADER] = String(timestamp)
        headers[SIGNATURE_HEADER] = signRequest({
          privateKeyPem: identity.privateKeyPem,
          method: init.method,
          path: `${BACKEND_API_PREFIX}${path}`,
          timestamp,
          body: rawBody,
          installationId: init.installationId,
        })
        if (identity.deviceFingerprint !== null) {
          headers[DEVICE_HEADER] = identity.deviceFingerprint
        }
      }
      const request: RequestInit = { method: init.method, headers, signal: controller.signal }
      if (init.body !== undefined) request.body = rawBody
      const response = await doFetch(`${baseUrl}${BACKEND_API_PREFIX}${path}`, request)
      const accepted = init.acceptStatus?.(response.status) ?? response.ok
      const payload = await response.json().catch(() => undefined)
      if (!accepted) {
        const code = extractErrorCode(payload)
        throw new BackendClientError(
          `backend ${init.method} ${path} failed with HTTP ${response.status}${code === null ? '' : ` (${code})`}`,
          response.status,
          code,
        )
      }
      return payload
    } catch (error) {
      if (error instanceof BackendClientError) throw error
      if (isAbortError(error)) {
        throw new BackendClientError(`backend ${init.method} ${path} timed out after ${timeoutMs}ms`)
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new BackendClientError(`backend ${init.method} ${path} failed: ${message}`)
    } finally {
      clearTimeout(timer)
      inFlight.delete(controller)
    }
  }

  /** Reads may retry once; writes never do (idempotency is the caller's). */
  const read = async (path: string, installationId?: string): Promise<unknown> => {
    try {
      return await request(path, installationId === undefined
        ? { method: 'GET' }
        : { method: 'GET', installationId })
    } catch (error) {
      if (disposed) throw error
      if (error instanceof BackendClientError && error.status !== null && error.status < 500) throw error
      await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAY_MS))
      return request(path, installationId === undefined
        ? { method: 'GET' }
        : { method: 'GET', installationId })
    }
  }

  return {
    baseUrl,
    async bootstrap(installationId) {
      return parseV1Bootstrap(await read('/bootstrap', installationId))
    },
    async admissionTickets() {
      return parseV1AdmissionTicketsResponse(await read('/admission/tickets'))
    },
    async claimAdmission(installationId, ticketSecret, publicKey, deviceFingerprint) {
      return parseV1AdmissionClaimResponse(await request('/admission/claim', {
        method: 'POST',
        installationId,
        body: {
          ticket_secret: ticketSecret,
          public_key: publicKey,
          device_fingerprint: deviceFingerprint,
        },
      }))
    },
    async rekeyIdentity(installationId) {
      return parseV1RekeyResponse(await request('/identity/rekey', {
        method: 'POST',
        installationId,
        body: {},
      }))
    },
    async submitClaim(installationId, claimedEffectiveTokens, claimBusinessDate) {
      const payload = await request('/token-claims', {
        method: 'POST',
        installationId,
        body: {
          claimed_effective_tokens: claimedEffectiveTokens,
          claim_business_date: claimBusinessDate,
        },
      })
      return parseV1PersonalStateResponse(payload)
    },
    async dailyState(installationId) {
      return parseV1PersonalStateResponse(await read('/me/daily-state', installationId))
    },
    async snapshot() {
      return parseV1SnapshotResponse(await read('/snapshot'))
    },
    async history(afterVersion) {
      const suffix = afterVersion === undefined ? '' : `?after_version=${afterVersion}`
      return parseV1HistoryResponse(await read(`/history${suffix}`))
    },
    async vote(installationId, intent) {
      const payload = await request('/votes', {
        method: 'POST',
        installationId,
        body: intent,
        // A rejected-but-valid outcome arrives as 409 with a full body.
        acceptStatus: (status) => status === 200 || status === 409,
      })
      try {
        return parseV1VoteResponse(payload)
      } catch (error) {
        // Older staging binaries spent the incense then omitted
        // `global_snapshot`. Treat that as an accepted (or rejected) vote and
        // pull the published snapshot instead of 502'ing the browser.
        if (!isMissingVoteSnapshotError(error)) throw error
        const envelope = parseV1VoteEnvelope(payload)
        if (envelope.global_snapshot !== null) {
          return completeV1VoteResponse(envelope, envelope.global_snapshot)
        }
        const published = parseV1SnapshotResponse(await read('/snapshot'))
        return completeV1VoteResponse(envelope, published.global_snapshot)
      }
    },
    dispose() {
      disposed = true
      for (const controller of inFlight) controller.abort()
      inFlight.clear()
    },
  }
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: unknown }).name
  if (name === 'AbortError' || name === 'TimeoutError') return true
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('aborted') || message.includes('AbortError')
}

function extractErrorCode(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const error = (payload as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}
