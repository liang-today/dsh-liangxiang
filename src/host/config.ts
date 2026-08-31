/**
 * Host configuration from the environment (dev-facing knobs; no secrets).
 * Every value has a safe default; malformed values fall back loudly.
 */
import { DEFAULT_TOKEN_PER_INCENSE } from '../domain/index.ts'
import { DEFAULT_CASE_TITLE, STARTER_INCENSE_COUNT } from '../shared/index.ts'
import { DEFAULT_BUSINESS_TIMEZONE } from '../shared/business-date.ts'
import { readLiangxiangEnv } from '../shared/env.ts'
import type { HostAuthorityPreference } from '../shared/wire.ts'
import { normalizeBaseUrl } from './backend-client.ts'
import { STAGING_BACKEND_URL } from './community-endpoint.ts'
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
   * Backend base URL. Default is the closed-beta staging endpoint (online).
   * Always resolved so an explicit UI change can enter online mode later.
  */
  backendUrl: string
  /** Boot default used only until the Host-owned persisted preference exists. */
  defaultAuthorityPreference: HostAuthorityPreference
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
    warn(`[dsh-liangxiang] ignoring invalid ${label}=${raw}; using ${fallback}`)
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
  const timezoneRaw = readLiangxiangEnv(env, 'BUSINESS_TZ')
  const timezone = timezoneRaw?.trim() !== undefined && timezoneRaw.trim() !== ''
    ? timezoneRaw.trim()
    : DEFAULT_BUSINESS_TIMEZONE
  const refresh = parsePositiveInt(
    readLiangxiangEnv(env, 'SNAPSHOT_SECONDS'),
    DEFAULT_SNAPSHOT_REFRESH_SECONDS,
    'LIANGXIANG_SNAPSHOT_SECONDS',
    warn,
  )
  const snapshotRefreshSeconds = Math.min(Math.max(refresh, MIN_SNAPSHOT_REFRESH_SECONDS), MAX_SNAPSHOT_REFRESH_SECONDS)
  const seedRaw = readLiangxiangEnv(env, 'FAKE_SEED')?.trim()
  if (seedRaw !== undefined && seedRaw !== '' && seedRaw !== 'empty' && seedRaw !== 'demo') {
    warn(`[dsh-liangxiang] ignoring invalid LIANGXIANG_FAKE_SEED=${seedRaw}; using empty`)
  }
  return {
    timezone,
    tokenPerIncense: parsePositiveInt(
      readLiangxiangEnv(env, 'TOKEN_PER_INCENSE'),
      DEFAULT_TOKEN_PER_INCENSE,
      'LIANGXIANG_TOKEN_PER_INCENSE',
      warn,
    ),
    snapshotRefreshSeconds,
    seed: seedRaw === 'demo' ? 'demo' : 'empty',
    caseTitle: DEFAULT_CASE_TITLE,
    starterIncense: STARTER_INCENSE_COUNT,
  }
}

/**
 * Resolve the full host runtime configuration. Online is the default. The
 * special value `local` chooses the initial local preference but still keeps
 * the canonical URL available for a later explicit UI change. A bad URL never
 * changes mode; it falls back loudly to the canonical online endpoint.
 * @param env - environment map (injectable for tests).
 * @param warn - loud sink for ignored invalid values.
 * @returns the service config, always-resolved backend URL, and boot default.
 */
export function resolveHostRuntimeConfig(
  env: Record<string, string | undefined>,
  warn: (message: string) => void,
): HostRuntimeConfig {
  const service = resolveHostConfig(env, warn)
  const raw = readLiangxiangEnv(env, 'BACKEND_URL')?.trim()
  if (raw === 'local') {
    return {
      service,
      backendUrl: normalizeBaseUrl(STAGING_BACKEND_URL),
      defaultAuthorityPreference: 'local',
    }
  }
  const candidate = raw === undefined || raw === '' ? STAGING_BACKEND_URL : raw
  try {
    return { service, backendUrl: normalizeBaseUrl(candidate), defaultAuthorityPreference: 'online' }
  } catch (error) {
    warn(
      `[dsh-liangxiang] ignoring invalid LIANGXIANG_BACKEND_URL=${candidate} `
      + `(${error instanceof Error ? error.message : String(error)}); using ${STAGING_BACKEND_URL}`,
    )
    return {
      service,
      backendUrl: normalizeBaseUrl(STAGING_BACKEND_URL),
      defaultAuthorityPreference: 'online',
    }
  }
}
