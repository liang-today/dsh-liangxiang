/**
 * Host configuration from the environment (dev-facing knobs; no secrets).
 * Every value has a safe default; malformed values fall back loudly.
 */
import { DEFAULT_TOKEN_PER_INCENSE } from '../domain/index.ts'
import { DEFAULT_CASE_TITLE } from '../shared/index.ts'
import { DEFAULT_BUSINESS_TIMEZONE } from './business-date.ts'
import type { LiangServiceConfig } from './fake-service.ts'

export const DEFAULT_SNAPSHOT_REFRESH_SECONDS = 300
const MIN_SNAPSHOT_REFRESH_SECONDS = 5
const MAX_SNAPSHOT_REFRESH_SECONDS = 3600

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
