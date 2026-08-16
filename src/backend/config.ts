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

export const DEFAULT_BACKEND_PORT = 4180
export const DEFAULT_BACKEND_HOST = '127.0.0.1'
export const DEFAULT_BACKEND_DB_PATH = '.liangbiao-backend/liangbiao.sqlite'
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
    warn(`[liangbiao-backend] ignoring invalid ${label}=${raw}; using ${fallback}`)
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
  const requestedMode = trimmed(env.LIANGBIAO_AUTHORITY_MODE, 'DEV_STAGING_ONLY')
  if (!(AUTHORITY_MODES as readonly string[]).includes(requestedMode)) {
    throw new BackendConfigError(
      `unknown LIANGBIAO_AUTHORITY_MODE=${requestedMode}; expected one of ${AUTHORITY_MODES.join(', ')}`,
    )
  }
  if (requestedMode === 'VERIFIED_PRODUCTION') {
    throw new BackendConfigError(
      'VERIFIED_PRODUCTION is blocked: Decision Gate A = A3 (no server-verifiable identity or Token authority, docs/043). '
      + 'Run with LIANGBIAO_AUTHORITY_MODE=DEV_STAGING_ONLY.',
    )
  }
  const timezone = trimmed(env.LIANGBIAO_BUSINESS_TZ, DEFAULT_BUSINESS_TIMEZONE)
  // Fail loudly at boot rather than at midnight.
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
  return {
    // Narrowed by the membership check + the VERIFIED_PRODUCTION rejection above.
    authorityMode: requestedMode as BackendAuthorityMode,
    host: trimmed(env.LIANGBIAO_BACKEND_HOST, DEFAULT_BACKEND_HOST),
    port: parseInt_(env.LIANGBIAO_BACKEND_PORT, DEFAULT_BACKEND_PORT, 'LIANGBIAO_BACKEND_PORT', warn, {
      min: 0,
      max: 65_535,
    }),
    databasePath: trimmed(env.LIANGBIAO_BACKEND_DB, DEFAULT_BACKEND_DB_PATH),
    timezone,
    tokenPerIncense: parseInt_(
      env.LIANGBIAO_TOKEN_PER_INCENSE,
      DEFAULT_TOKEN_PER_INCENSE,
      'LIANGBIAO_TOKEN_PER_INCENSE',
      warn,
    ),
    snapshotRefreshSeconds: parseInt_(
      env.LIANGBIAO_SNAPSHOT_SECONDS,
      DEFAULT_SNAPSHOT_REFRESH_SECONDS,
      'LIANGBIAO_SNAPSHOT_SECONDS',
      warn,
      { min: MIN_SNAPSHOT_REFRESH_SECONDS, max: MAX_SNAPSHOT_REFRESH_SECONDS },
    ),
    caseTitle: trimmed(env.LIANGBIAO_CASE_TITLE, DEFAULT_CASE_TITLE),
    voteRateLimitPerMinute: parseInt_(
      env.LIANGBIAO_VOTE_RATE_LIMIT,
      600,
      'LIANGBIAO_VOTE_RATE_LIMIT',
      warn,
      { min: 0 },
    ),
  }
}
