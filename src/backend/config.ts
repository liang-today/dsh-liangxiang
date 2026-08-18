/**
 * Backend configuration from the environment. Localhost-only defaults, no
 * secrets, every value validated at boot.
 *
 * Decision Gate A = A3 (docs/043): `VERIFIED_PRODUCTION` is not reachable, so
 * asking for it is a hard boot failure rather than a silent downgrade — that is
 * the guard that keeps a staging deployment from being relabelled as verified.
 */
import { DEFAULT_TOKEN_PER_INCENSE } from '../domain/index.ts'
import { AUTHORITY_MODES, type BackendAuthorityMode } from '../shared/backend-v1.ts'
import { DEFAULT_BUSINESS_TIMEZONE } from '../shared/business-date.ts'
import { DEFAULT_CASE_TITLE } from '../shared/index.ts'
import { readLiangxiangEnv } from '../shared/env.ts'
import { DEFAULT_VOTE_RATE_LIMIT_MAX_KEYS, DEFAULT_VOTE_RATE_LIMIT_PER_MINUTE } from './vote-rate-limit.ts'

export const DEFAULT_BACKEND_PORT = 4180
export const DEFAULT_BACKEND_HOST = '127.0.0.1'
export const DEFAULT_BACKEND_DB_PATH = '.liangxiang-backend/liangxiang.sqlite'
/**
 * Near-real-time by default: a voter must see their own vote move the public
 * 梁位 within a second, otherwise the loop stops feeling like voting. Snapshot
 * CONSISTENCY is unaffected — every published row still carries its own
 * sequence, and ratios/state are always derived from one row.
 */
export const DEFAULT_SNAPSHOT_REFRESH_SECONDS = 1
const MIN_SNAPSHOT_REFRESH_SECONDS = 1
const MAX_SNAPSHOT_REFRESH_SECONDS = 3600

/**
 * Published snapshots kept per case. At a 1s cadence the table would otherwise
 * grow by up to 86k rows a day; only the latest row is ever served, and a short
 * tail is enough to debug a cadence question.
 */
export const SNAPSHOT_HISTORY_LIMIT = 200

/**
 * Absurd single-claim ceiling in tokens (~500 炷 at the 50K default). This is
 * NOT a rate limit for honest usage — it only clamps a host that reports an
 * impossible per-claim jump, with an explicit notice so it reads as a guard,
 * not as a silent "香火不涨" bug. 0 disables the guard.
 */
export const DEFAULT_ABSURD_CLAIM_TOKENS = 25_000_000
export const DEFAULT_ADMISSION_CLAIM_RATE_LIMIT = 120
export const DEFAULT_ADMISSION_TICKET_TTL_HOURS = 24
export const DEFAULT_ADMISSION_TICKET_MAX_CLAIMS = 1
export const DEFAULT_ADMISSION_PUBLIC_LIST_LIMIT = 20

/**
 * How long a device fingerprint must sit unused before its binding can be
 * re-keyed to a new installation (the "cost" of recovery). The old identity's
 * balance/votes are forfeited on re-key. 0 disables the cooldown (re-key
 * becomes free — only appropriate for tests).
 */
export const DEFAULT_REKEY_COOLDOWN_MS = 30 * 60 * 1000

export interface BackendConfig {
  authorityMode: BackendAuthorityMode
  host: string
  port: number
  /** SQLite file path, or `:memory:` for tests. */
  databasePath: string
  timezone: string
  tokenPerIncense: number
  snapshotRefreshSeconds: number
  caseTitle: string
  /** Per-installation vote rate limit (requests per minute); 0 disables it. */
  voteRateLimitPerMinute: number
  /** Hard cap on installation keys retained by the in-memory vote limiter. */
  voteRateLimitMaxKeys: number
  /** Absurd single-claim ceiling (tokens); 0 disables the guard. */
  absurdClaimTokens: number
  /** Device-fingerprint re-key cooldown (ms); 0 disables it. */
  rekeyCooldownMs: number
  /** Server-wide first-install ticket claims per minute; 0 disables it. */
  admissionClaimRateLimitPerMinute: number
  /** Operator issue defaults; existing tickets retain their own values. */
  admissionTicketTtlHours: number
  admissionTicketMaxClaims: number
  /** Maximum ticket secrets returned by one public list response. */
  admissionPublicListLimit: number
  /** When true, HTTP accepts the old unsigned installation header (localhost tests). */
  allowUnsigned: boolean
}

export class BackendConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackendConfigError'
  }
}

function parseInt_(
  raw: string | undefined,
  fallback: number,
  label: string,
  warn: (message: string) => void,
  { min = 1, max = Number.MAX_SAFE_INTEGER }: { min?: number, max?: number } = {},
): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    warn(`[liangxiang-backend] ignoring invalid ${label}=${raw}; using ${fallback}`)
    return fallback
  }
  return value
}

function trimmed(raw: string | undefined, fallback: string): string {
  const value = raw?.trim()
  return value === undefined || value === '' ? fallback : value
}

/**
 * Resolve the backend configuration.
 * @param env - environment map (injectable for tests).
 * @param warn - loud sink for ignored invalid values.
 * @returns the validated configuration.
 */
export function resolveBackendConfig(
  env: Record<string, string | undefined>,
  warn: (message: string) => void = (message) => console.warn(message),
): BackendConfig {
  const requestedMode = trimmed(readLiangxiangEnv(env, 'AUTHORITY_MODE'), 'DEV_STAGING_ONLY')
  if (!(AUTHORITY_MODES as readonly string[]).includes(requestedMode)) {
    throw new BackendConfigError(
      `unknown LIANGXIANG_AUTHORITY_MODE=${requestedMode}; expected one of ${AUTHORITY_MODES.join(', ')}`,
    )
  }
  if (requestedMode === 'VERIFIED_PRODUCTION') {
    throw new BackendConfigError(
      'VERIFIED_PRODUCTION is blocked: Decision Gate A = A3 (no server-verifiable identity or Token authority, docs/043). '
      + 'Run with LIANGXIANG_AUTHORITY_MODE=DEV_STAGING_ONLY.',
    )
  }
  const timezone = trimmed(readLiangxiangEnv(env, 'BUSINESS_TZ'), DEFAULT_BUSINESS_TIMEZONE)
  // Fail loudly at boot rather than at midnight.
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
  const host = trimmed(readLiangxiangEnv(env, 'BACKEND_HOST'), DEFAULT_BACKEND_HOST)
  const allowUnsigned = trimmed(readLiangxiangEnv(env, 'ALLOW_UNSIGNED'), '') === '1'
  if (allowUnsigned && host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw new BackendConfigError('LIANGXIANG_ALLOW_UNSIGNED=1 is permitted only on a loopback backend host')
  }
  return {
    // Narrowed by the membership check + the VERIFIED_PRODUCTION rejection above.
    authorityMode: requestedMode as BackendAuthorityMode,
    host,
    port: parseInt_(readLiangxiangEnv(env, 'BACKEND_PORT'), DEFAULT_BACKEND_PORT, 'LIANGXIANG_BACKEND_PORT', warn, {
      min: 0,
      max: 65_535,
    }),
    databasePath: trimmed(readLiangxiangEnv(env, 'BACKEND_DB'), DEFAULT_BACKEND_DB_PATH),
    timezone,
    tokenPerIncense: parseInt_(
      readLiangxiangEnv(env, 'TOKEN_PER_INCENSE'),
      DEFAULT_TOKEN_PER_INCENSE,
      'LIANGXIANG_TOKEN_PER_INCENSE',
      warn,
    ),
    snapshotRefreshSeconds: parseInt_(
      readLiangxiangEnv(env, 'SNAPSHOT_SECONDS'),
      DEFAULT_SNAPSHOT_REFRESH_SECONDS,
      'LIANGXIANG_SNAPSHOT_SECONDS',
      warn,
      { min: MIN_SNAPSHOT_REFRESH_SECONDS, max: MAX_SNAPSHOT_REFRESH_SECONDS },
    ),
    caseTitle: trimmed(readLiangxiangEnv(env, 'CASE_TITLE'), DEFAULT_CASE_TITLE),
    voteRateLimitPerMinute: parseInt_(
      readLiangxiangEnv(env, 'VOTE_RATE_LIMIT'),
      DEFAULT_VOTE_RATE_LIMIT_PER_MINUTE,
      'LIANGXIANG_VOTE_RATE_LIMIT',
      warn,
      { min: 0 },
    ),
    voteRateLimitMaxKeys: parseInt_(
      readLiangxiangEnv(env, 'VOTE_RATE_LIMIT_MAX_KEYS'),
      DEFAULT_VOTE_RATE_LIMIT_MAX_KEYS,
      'LIANGXIANG_VOTE_RATE_LIMIT_MAX_KEYS',
      warn,
    ),
    absurdClaimTokens: parseInt_(
      readLiangxiangEnv(env, 'ABSURD_CLAIM_TOKENS'),
      DEFAULT_ABSURD_CLAIM_TOKENS,
      'LIANGXIANG_ABSURD_CLAIM_TOKENS',
      warn,
      { min: 0 },
    ),
    rekeyCooldownMs: parseInt_(
      readLiangxiangEnv(env, 'REKEY_COOLDOWN_MS'),
      DEFAULT_REKEY_COOLDOWN_MS,
      'LIANGXIANG_REKEY_COOLDOWN_MS',
      warn,
      { min: 0 },
    ),
    admissionClaimRateLimitPerMinute: parseInt_(
      readLiangxiangEnv(env, 'ADMISSION_CLAIM_RATE_LIMIT'),
      DEFAULT_ADMISSION_CLAIM_RATE_LIMIT,
      'LIANGXIANG_ADMISSION_CLAIM_RATE_LIMIT',
      warn,
      { min: 0, max: 100_000 },
    ),
    admissionTicketTtlHours: parseInt_(
      readLiangxiangEnv(env, 'ADMISSION_TICKET_TTL_HOURS'),
      DEFAULT_ADMISSION_TICKET_TTL_HOURS,
      'LIANGXIANG_ADMISSION_TICKET_TTL_HOURS',
      warn,
      { min: 1, max: 24 * 365 },
    ),
    admissionTicketMaxClaims: parseInt_(
      readLiangxiangEnv(env, 'ADMISSION_TICKET_MAX_CLAIMS'),
      DEFAULT_ADMISSION_TICKET_MAX_CLAIMS,
      'LIANGXIANG_ADMISSION_TICKET_MAX_CLAIMS',
      warn,
      { min: 1, max: 10_000 },
    ),
    admissionPublicListLimit: parseInt_(
      readLiangxiangEnv(env, 'ADMISSION_PUBLIC_LIST_LIMIT'),
      DEFAULT_ADMISSION_PUBLIC_LIST_LIMIT,
      'LIANGXIANG_ADMISSION_PUBLIC_LIST_LIMIT',
      warn,
      { min: 1, max: 1_000 },
    ),
    allowUnsigned,
  }
}
