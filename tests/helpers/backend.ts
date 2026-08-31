/**
 * In-memory backend fixtures: one SQLite `:memory:` database, an injectable
 * clock, and helpers for the recurring "give this installation N incense" step.
 */
import { resolveBackendConfig, type BackendConfig } from '../../src/backend/config.ts'
import { LiangxiangBackendService } from '../../src/backend/service.ts'
import { openBackendStore, type BackendStore } from '../../src/backend/store.ts'
import type { Clock } from '../../src/shared/business-date.ts'

/** 2026-08-16 12:00 in Asia/Shanghai. */
export const FIXED_NOW = Date.UTC(2026, 7, 16, 4, 0, 0)
export const DAY_MS = 24 * 60 * 60 * 1000

export interface MutableClock extends Clock {
  set(epochMs: number): void
  advance(deltaMs: number): void
}

export function createMutableClock(start = FIXED_NOW): MutableClock {
  let current = start
  return {
    now: () => current,
    set: (epochMs) => {
      current = epochMs
    },
    advance: (deltaMs) => {
      current += deltaMs
    },
  }
}

export interface BackendFixture {
  service: LiangxiangBackendService
  store: BackendStore
  config: BackendConfig
  clock: MutableClock
  /** Raise the installation's claim so it can afford `count` votes. */
  grantIncense(installationId: string, count: number, extraTokens?: number): void
  close(): void
}

export function createBackendFixture(
  env: Record<string, string | undefined> = {},
  start = FIXED_NOW,
): BackendFixture {
  const config = resolveBackendConfig(
    { LIANGXIANG_BACKEND_DB: ':memory:', LIANGXIANG_SNAPSHOT_SECONDS: '1', LIANGXIANG_MAX_TOKENS_PER_MINUTE: '0', LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0', ...env },
    () => undefined,
  )
  const store = openBackendStore(config.databasePath)
  const clock = createMutableClock(start)
  const service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
  return {
    service,
    store,
    config,
    clock,
    grantIncense(installationId, count, extraTokens = 0) {
      const date = service.businessDate()
      service.dailyState(installationId)
      const current = store.incenseFor(installationId, date)?.claimed_effective_tokens ?? 0
      service.applyTokenClaim(installationId, {
        claimed_effective_tokens: current + count * config.tokenPerIncense + extraTokens,
        claim_business_date: date,
      })
    },
    close: () => store.close(),
  }
}
