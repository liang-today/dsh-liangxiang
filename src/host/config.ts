/**
 * Host configuration from the environment (dev-facing knobs; no secrets).
 * Every value has a safe default; malformed values fall back loudly.
 */
import { DEFAULT_TOKEN_PER_INCENSE } from '../domain/index.ts'
import { DEFAULT_CASE_TITLE } from '../shared/index.ts'
import { DEFAULT_BUSINESS_TIMEZONE } from '../shared/business-date.ts'
import { normalizeBaseUrl } from './backend-client.ts'
import type { LiangServiceConfig } from './fake-service.ts'

/**
 * Near-real-time cadence: the public 梁位 must visibly move right after a vote
 * (see backend/config.ts for the same reasoning on the publishing side).
 */
export const DEFAULT_SNAPSHOT_REFRESH_SECONDS = 1
const MIN_SNAPSHOT_REFRESH_SECONDS = 1
const MAX_SNAPSHOT_REFRESH_SECONDS = 3600

/** Host-side resolution of which authority the plugin should serve. */
export interface HostRuntimeConfig {
  service: LiangServiceConfig
  /**
   * Backend base URL from `LIANGBIAO_BACKEND_URL`. When present the host runs
   * DEV_STAGING_ONLY (the backend is authority); when absent it runs the
   * in-process LOCAL_FAKE_DEV loop.
   */
  backendUrl: string | null
  /** Shared community admission key; sent on every authenticated backend call. */
  communityKey: string | null
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  label: string,
  warn: (message: string) => void,
): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    warn(`[dsh-liangbiao] ignoring invalid ${label}=${raw}; using ${fallback}`)
    return fallback
  }
  return value
}

/**
 * Resolve the service configuration.
 * @param env - environment map (injectable for tests).
 * @param warn - loud sink for ignored invalid values.
 * @returns the frozen service configuration.
 */
export function resolveHostConfig(
  env: Record<string, string | undefined>,
  warn: (message: string) => void,
): LiangServiceConfig {
  const timezone = env.LIANGBIAO_BUSINESS_TZ?.trim() !== undefined && env.LIANGBIAO_BUSINESS_TZ?.trim() !== ''
    ? (env.LIANGBIAO_BUSINESS_TZ as string).trim()
    : DEFAULT_BUSINESS_TIMEZONE
  const refresh = parsePositiveInt(
    env.LIANGBIAO_SNAPSHOT_SECONDS,
    DEFAULT_SNAPSHOT_REFRESH_SECONDS,
    'LIANGBIAO_SNAPSHOT_SECONDS',
    warn,
  )
  const snapshotRefreshSeconds = Math.min(Math.max(refresh, MIN_SNAPSHOT_REFRESH_SECONDS), MAX_SNAPSHOT_REFRESH_SECONDS)
  const seedRaw = env.LIANGBIAO_FAKE_SEED?.trim()
  if (seedRaw !== undefined && seedRaw !== '' && seedRaw !== 'empty' && seedRaw !== 'demo') {
    warn(`[dsh-liangbiao] ignoring invalid LIANGBIAO_FAKE_SEED=${seedRaw}; using empty`)
  }
  return {
    timezone,
    tokenPerIncense: parsePositiveInt(
      env.LIANGBIAO_TOKEN_PER_INCENSE,
      DEFAULT_TOKEN_PER_INCENSE,
      'LIANGBIAO_TOKEN_PER_INCENSE',
      warn,
    ),
    snapshotRefreshSeconds,
    seed: seedRaw === 'demo' ? 'demo' : 'empty',
    caseTitle: DEFAULT_CASE_TITLE,
  }
}

/**
 * Resolve the full host runtime configuration, including which authority mode
 * to serve. An unparseable backend URL degrades to local mode loudly rather
 * than booting a half-wired online path.
 * @param env - environment map (injectable for tests).
 * @param warn - loud sink for ignored invalid values.
 * @returns the service config plus the resolved backend URL (or null).
 */
export function resolveHostRuntimeConfig(
  env: Record<string, string | undefined>,
  warn: (message: string) => void,
): HostRuntimeConfig {
  const service = resolveHostConfig(env, warn)
  const communityRaw = env.LIANGBIAO_COMMUNITY_KEY?.trim()
  const communityKey = communityRaw === undefined || communityRaw === '' ? null : communityRaw
  const raw = env.LIANGBIAO_BACKEND_URL?.trim()
  if (raw === undefined || raw === '') return { service, backendUrl: null, communityKey }
  try {
    return { service, backendUrl: normalizeBaseUrl(raw), communityKey }
  } catch (error) {
    warn(
      `[dsh-liangbiao] ignoring invalid LIANGBIAO_BACKEND_URL=${raw} `
      + `(${error instanceof Error ? error.message : String(error)}); running in local mode`,
    )
    return { service, backendUrl: null, communityKey }
  }
}
